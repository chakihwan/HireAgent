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


# ── 항목별 서브그래프 ──────────────────────────────────────────

def _needs_compression(state: ItemState) -> str:
    result = validate_chars(state["content"], state["item"]["char_limit"])
    if result == "ok":
        return "evaluate"
    if state.get("iteration", 1) >= MAX_ITERATIONS:
        return "evaluate"   # 재시도 초과 시 그냥 평가로 진행
    return "compress"


def _build_item_graph() -> StateGraph:
    g = StateGraph(ItemState)
    g.add_node("retrieve", rag_retriever_node)
    g.add_node("write", essay_writer_node)
    g.add_node("compress", compressor_node)
    g.add_node("evaluate", evaluator_node)

    g.set_entry_point("retrieve")
    g.add_edge("retrieve", "write")
    g.add_conditional_edges("write", _needs_compression, {"compress": "compress", "evaluate": "evaluate"})
    g.add_conditional_edges("compress", _needs_compression, {"compress": "compress", "evaluate": "evaluate"})
    g.add_edge("evaluate", END)
    return g


_item_graph = _build_item_graph().compile()


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
                agent_config=state["agent_config"],
                user_id=state["user_id"],
                rag_context=[],
                rag_sources={},
                tech_whitelist=[],
                node_events=[],
                content="",
                char_count=0,
                iteration=0,
                evaluation_score=None,
                evaluation_feedback=None,
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
