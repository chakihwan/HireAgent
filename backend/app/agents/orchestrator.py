from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field

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
# 모든 노드는 ItemState를 받아 dict를 반환하는 공통 시그니처라 그래프로 조립할 수 있다.
# 노드 메타(NodeSpec)로 종류(linear/gate)와 State 입출력 계약(requires/provides)을 선언해,
# gate(조건 루프)를 '위치'가 아닌 '속성'으로 처리하고 잘못된 노드 조합을 빌드 시 검증한다.
# 자료구조는 그래프(nodes+edges)라 단계 4의 완전 자유 DAG까지 연속된다 (ADR-028).


def _make_compress_router(next_node: str) -> Callable[[ItemState], str]:
    """gate 라우터: 글자수 OK 또는 재시도 초과면 'next'(탈출), 아니면 'loop'(반복)."""
    def router(state: ItemState) -> str:
        result = validate_chars(state["content"], state["item"]["char_limit"])
        if result == "ok" or state.get("iteration", 1) >= MAX_ITERATIONS:
            return "next"
        return "loop"

    return router


@dataclass(frozen=True)
class NodeSpec:
    """노드 메타 — 함수 + 종류 + State 입출력 계약.

    kind="gate"는 조건 루프 노드(현재 compress). gate_router가 loop/next를 결정한다.
    requires/provides는 '의미있게 채워지는' State 키 계약 — 빌드 시 requires를 앞 노드가
    제공했는지 검증한다 (예: content는 write가 만든다 → evaluate를 write 앞에 두면 거부).
    """

    func: Callable
    kind: str = "linear"  # "linear" | "gate"
    requires: frozenset[str] = field(default_factory=frozenset)
    provides: frozenset[str] = field(default_factory=frozenset)
    gate_router: Callable[[str], Callable] | None = None


NODE_REGISTRY: dict[str, NodeSpec] = {
    "retrieve": NodeSpec(rag_retriever_node, provides=frozenset({"rag_context"})),
    "write": NodeSpec(essay_writer_node, provides=frozenset({"content"})),
    "compress": NodeSpec(
        compressor_node, kind="gate",
        requires=frozenset({"content"}), provides=frozenset({"content"}),
        gate_router=_make_compress_router,
    ),
    "evaluate": NodeSpec(evaluator_node, requires=frozenset({"content"})),
}

# fan_out이 ItemState에 의미있게 주입하는 초기 키 (State 계약 검증의 시작 집합)
_INITIAL_KEYS = frozenset({"item", "jd_analysis", "target_company", "agent_config", "user_id"})


@dataclass
class WorkflowDef:
    """항목 서브그래프 정의. edges가 비면 nodes 순서대로 선형 연결한다.

    선형은 그래프의 특수 케이스 — 단계 4(완전 자유 DAG)는 edges를 명시해 분기/병합한다.
    """

    nodes: list[str]
    edges: list[tuple[str, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.edges and self.nodes:
            self.edges = [
                (self.nodes[i], self.nodes[i + 1]) for i in range(len(self.nodes) - 1)
            ]

    @property
    def entry(self) -> str:
        return self.nodes[0]


# 기본 파이프라인 — 기존 고정 그래프와 동등. 사용자 정의 flow의 기본값.
DEFAULT_ITEM_FLOW = ["retrieve", "write", "compress", "evaluate"]


def validate_workflow(wf: WorkflowDef) -> None:
    """노드 타입 + State 계약 검증. 잘못된 조합은 빌드 전에 막는다."""
    if not wf.nodes:
        raise ValueError("워크플로우에 노드가 없습니다")
    unknown = [n for n in wf.nodes if n not in NODE_REGISTRY]
    if unknown:
        raise ValueError(f"알 수 없는 노드 타입: {unknown}")

    # State 계약 — 선형 순서대로 requires가 앞에서 제공됐는지 (DAG 위상정렬은 단계 4)
    available = set(_INITIAL_KEYS)
    for nid in wf.nodes:
        spec = NODE_REGISTRY[nid]
        missing = spec.requires - available
        if missing:
            raise ValueError(
                f"노드 '{nid}'의 필수 입력 {set(missing)}을(를) 앞 노드가 제공하지 않습니다 "
                f"('content'는 write가 만듭니다)"
            )
        available |= spec.provides


def build_item_graph(workflow: WorkflowDef | list[str]) -> StateGraph:
    """워크플로우 정의 → 항목 서브그래프 동적 구성.

    노드 종류(NodeSpec.kind)로 엣지를 연결한다. gate 노드는 자기 루프 + 조건 탈출이고,
    gate로 들어오는 엣지도 조건부(이미 충족이면 건너뜀)로 만든다 — 위치가 아닌 속성 기반.
    """
    wf = WorkflowDef(workflow) if isinstance(workflow, list) else workflow
    validate_workflow(wf)

    out_edges: dict[str, list[str]] = defaultdict(list)
    for a, b in wf.edges:
        out_edges[a].append(b)

    g = StateGraph(ItemState)
    for nid in wf.nodes:
        g.add_node(nid, NODE_REGISTRY[nid].func)
    g.set_entry_point(wf.entry)

    for nid in wf.nodes:
        spec = NODE_REGISTRY[nid]
        nexts: list = out_edges[nid] or [END]
        if spec.kind == "gate":
            # gate 자기 엣지: 수렴까지 반복, 탈출 시 next
            after = nexts[0]
            assert spec.gate_router is not None
            g.add_conditional_edges(nid, spec.gate_router(after), {"loop": nid, "next": after})
        else:
            for nxt in nexts:
                nxt_spec = NODE_REGISTRY.get(nxt) if nxt is not END else None
                if nxt_spec is not None and nxt_spec.kind == "gate":
                    # 다음이 gate면 진입도 조건부 — 이미 충족이면 gate를 건너뛴다
                    gate_after = (out_edges[nxt] or [END])[0]
                    assert nxt_spec.gate_router is not None
                    g.add_conditional_edges(
                        nid, nxt_spec.gate_router(gate_after), {"loop": nxt, "next": gate_after}
                    )
                else:
                    g.add_edge(nid, nxt)
    return g


# flow(노드 구성)별 컴파일 그래프 캐시 — 같은 구성은 1회만 컴파일 (매 요청 컴파일 방지)
_graph_cache: dict[tuple[str, ...], object] = {}


def get_item_graph(flow: tuple[str, ...] | None = None):
    """flow별 컴파일된 항목 서브그래프 (캐시). flow 미지정 시 DEFAULT."""
    key = tuple(flow) if flow else tuple(DEFAULT_ITEM_FLOW)
    if key not in _graph_cache:
        _graph_cache[key] = build_item_graph(list(key)).compile()
    return _graph_cache[key]


# DEFAULT 워밍업 (모듈 로드 시 1회 컴파일 — 기존 동작 유지)
get_item_graph()


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
                flow=state.get("flow") or DEFAULT_ITEM_FLOW,
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

    result = await get_item_graph(tuple(item_state["flow"])).ainvoke(item_state)
    draft = Draft(
        category=result["item"]["category"],
        content=result["content"],
        char_count=result["char_count"],
        iteration=result.get("iteration", 1),
        evaluation_score=result.get("evaluation_score"),
        evaluation_feedback=result.get("evaluation_feedback"),
        evaluation_scores=result.get("evaluation_scores"),
        draft_history=result.get("draft_history") or [],
        rag_citations=result.get("rag_citations") or [],
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
