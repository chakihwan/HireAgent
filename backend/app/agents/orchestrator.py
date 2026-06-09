from langgraph.graph import END, StateGraph
from langgraph.types import Send

from app.agents.compressor import compressor_node
from app.agents.essay_writer import essay_writer_node
from app.agents.evaluator import evaluator_node
from app.agents.jd_analyzer import jd_analyzer_node
from app.agents.rag_retriever import rag_retriever_node
from app.agents.state import Draft, EssayState, ItemState
from app.utils.char_counter import validate_chars

MAX_ITERATIONS = 3
MIN_EVAL_SCORE = 6.0


# ── 항목별 서브그래프 (동적 구성) ──────────────────────────────
#
# 노드는 모두 ItemState를 받아 dict를 반환하는 공통 시그니처라 타입 시퀀스로
# 조립할 수 있다. compress만 "조건 게이트" — 글자수가 안 맞을 때만 실행되고
# 수렴(또는 MAX_ITERATIONS)까지 반복한다. 향후 사용자가 flow를 커스텀 (ADR-028).

NODE_REGISTRY = {
    "retrieve": rag_retriever_node,
    "write": essay_writer_node,
    "compress": compressor_node,
    "evaluate": evaluator_node,
}

# 기본 파이프라인 — 기존 고정 그래프와 동등. 사용자 정의 flow의 기본값.
DEFAULT_ITEM_FLOW = ["retrieve", "write", "compress", "evaluate"]


def _make_compress_router(next_node: str):
    """compress 게이트 라우터. 글자수 OK 또는 재시도 초과면 next로 탈출, 아니면 compress 반복.

    compress로 진입하는 엣지와 compress 자기 엣지 양쪽에 쓰여, write 결과가 이미
    적정 글자수면 compress를 건너뛴다 (기존 _needs_compression과 동일 동작).
    """
    def router(state: ItemState) -> str:
        result = validate_chars(state["content"], state["item"]["char_limit"])
        if result == "ok" or state.get("iteration", 1) >= MAX_ITERATIONS:
            return "next"
        return "loop"

    return router


def build_item_graph(flow: list[str]) -> StateGraph:
    """노드 타입 시퀀스 → 항목 서브그래프 동적 구성.

    선형 파이프라인이며 compress 노드는 조건 게이트(글자수 수렴 루프)로 연결한다.
    완전 자유 DAG 편집은 후속 — 현재는 선형 + compress 루프.
    """
    unknown = [n for n in flow if n not in NODE_REGISTRY]
    if unknown:
        raise ValueError(f"알 수 없는 노드 타입: {unknown}")
    if not flow:
        raise ValueError("flow가 비어 있습니다")

    g = StateGraph(ItemState)
    for node_id in flow:
        g.add_node(node_id, NODE_REGISTRY[node_id])
    g.set_entry_point(flow[0])

    for i, node_id in enumerate(flow):
        next_node = flow[i + 1] if i + 1 < len(flow) else END
        if node_id == "compress":
            # compress 자기 엣지: 수렴까지 반복, 탈출 시 next
            g.add_conditional_edges(
                node_id, _make_compress_router(next_node),
                {"loop": "compress", "next": next_node},
            )
        elif next_node == "compress":
            # compress 진입도 조건부 — 이미 글자수 OK면 compress를 건너뛴다
            after = flow[i + 2] if i + 2 < len(flow) else END
            g.add_conditional_edges(
                node_id, _make_compress_router(after),
                {"loop": "compress", "next": after},
            )
        else:
            g.add_edge(node_id, next_node)
    return g


_item_graph = build_item_graph(DEFAULT_ITEM_FLOW).compile()


# ── 메인 오케스트레이터 그래프 ────────────────────────────────

def _fan_out(state: EssayState) -> list[Send]:
    """JD 분석 후 항목별로 병렬 Send"""
    return [
        Send(
            "_process_item",
            ItemState(
                item=item,
                jd_analysis=state["jd_analysis"],
                target_company=state.get("target_company", "알 수 없음"),
                agent_config=item.get("agent_config") or state["agent_config"],
                user_id=state["user_id"],
                rag_context=[],
                rag_sources={},
                tech_whitelist=[],
                node_events=[],
                draft_history=[],
                content="",
                char_count=0,
                iteration=0,
                evaluation_score=None,
                evaluation_feedback=None,
                evaluation_scores=None,
            ),
        )
        for item in state["items"]
    ]


async def _process_item(item_state: ItemState) -> dict:
    """항목 서브그래프 실행 → EssayState.drafts/progress에 추가"""
    from app.utils.text_cleaner import detect_output_issue

    result = await _item_graph.ainvoke(item_state)
    draft = Draft(
        category=result["item"]["category"],
        content=result["content"],
        char_count=result["char_count"],
        iteration=result.get("iteration", 1),
        evaluation_score=result.get("evaluation_score"),
        evaluation_feedback=result.get("evaluation_feedback"),
        evaluation_scores=result.get("evaluation_scores"),
        draft_history=result.get("draft_history") or [],
    )
    rag_count = len(result.get("rag_context") or [])
    rag_sources = result.get("rag_sources") or {}
    if rag_count and rag_sources:
        breakdown = ", ".join(f"{k} {v}" for k, v in rag_sources.items())
        rag_note = f" [RAG {rag_count}개 참고: {breakdown}]"
    elif rag_count:
        rag_note = f" [RAG {rag_count}개 참고]"
    else:
        rag_note = ""

    # 출력 품질 검사 — 모델 폭주 / 다국어 혼용 감지
    issue = detect_output_issue(result["content"])
    char_target = result["item"]["char_limit"]
    char_count = draft["char_count"]
    tolerance = 0.05
    char_ok = int(char_target * (1 - tolerance)) <= char_count <= int(char_target * (1 + tolerance))

    progress_lines: list[str] = [
        f"✅ {draft['category']} 완료 "
        f"({char_count}자, 평가 {draft['evaluation_score'] or '-'}점){rag_note}"
    ]
    if not char_ok:
        diff = char_count - char_target
        direction = "초과" if diff > 0 else "부족"
        progress_lines.append(
            f"⚠️ {draft['category']} 글자수 {direction}: 목표 {char_target}자 / 실제 {char_count}자 "
            f"({abs(diff):+d}자) — 재생성하거나 직접 수정하세요."
        )
    if issue:
        progress_lines.append(
            f"⚠️ {draft['category']} 품질 경고: {issue} — 작은 다국어 모델은 한국어가 약합니다. "
            f"한국어 특화 모델(exaone3.5:7.8b 등) 사용을 권장합니다."
        )

    node_events = result.get("node_events") or []
    return {"drafts": [draft], "progress": progress_lines, "node_events": node_events}


def _build_main_graph() -> StateGraph:
    g = StateGraph(EssayState)
    g.add_node("jd_analyzer", jd_analyzer_node)
    g.add_node("_process_item", _process_item)

    g.set_entry_point("jd_analyzer")
    g.add_conditional_edges("jd_analyzer", _fan_out, ["_process_item"])
    g.add_edge("_process_item", END)
    return g


essay_graph = _build_main_graph().compile()
