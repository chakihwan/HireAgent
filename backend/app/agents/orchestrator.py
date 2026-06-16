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
MAX_REFINE_ITERATIONS = 2  # 평가 점수 미달 시 재작성 최대 횟수 (ADR-029 4a)


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


def _make_refine_router(next_node: str) -> Callable[[ItemState], str]:
    """gate 라우터(ADR-029 4a): 루브릭 평가 점수 미달이면 'loop'(write로 재작성).

    판정은 Python(결정론적) — LLM은 채점만. 재작성 비활성·점수 통과·재시도 초과면 'next'.
    """
    def router(state: ItemState) -> str:
        if not state.get("refine_enabled"):
            return "next"
        score = state.get("evaluation_score")
        if score is None or score >= MIN_EVAL_SCORE:
            return "next"
        # refine_iteration = 누적 평가 횟수(evaluator가 증가). 초과하면 더 재작성하지 않음.
        if state.get("refine_iteration", 0) > MAX_REFINE_ITERATIONS:
            return "next"
        # 글자수가 안 맞으면 재작성(write)은 더 길어져 악화 — 그건 compress 영역이니 스킵.
        # refine은 '글자수는 맞는데 품질이 미달'일 때만 다시 쓴다 (악순환 방지).
        if validate_chars(state["content"], state["item"]["char_limit"]) != "ok":
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
    loop_target: str | None = None  # gate 루프 대상 (None=자기, "write"=역방향)
    entry_conditional: bool = True  # 진입 시 판정(compress) vs 실행 후(evaluate)


NODE_REGISTRY: dict[str, NodeSpec] = {
    "retrieve": NodeSpec(rag_retriever_node, provides=frozenset({"rag_context"})),
    "write": NodeSpec(essay_writer_node, provides=frozenset({"content"})),
    "compress": NodeSpec(
        compressor_node, kind="gate",
        requires=frozenset({"content"}), provides=frozenset({"content"}),
        gate_router=_make_compress_router,
    ),
    "evaluate": NodeSpec(
        evaluator_node, kind="gate",
        requires=frozenset({"content"}),
        gate_router=_make_refine_router,
        loop_target="write", entry_conditional=False,
    ),
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
            # gate 엣지: 수렴까지 반복(loop_target), 탈출 시 next.
            # loop_target=None은 자기 자신(compress), "write"는 역방향(refine: 재작성).
            after = nexts[0]
            assert spec.gate_router is not None
            g.add_conditional_edges(
                nid, spec.gate_router(after), {"loop": spec.loop_target or nid, "next": after}
            )
        else:
            for nxt in nexts:
                nxt_spec = NODE_REGISTRY.get(nxt) if nxt is not END else None
                if nxt_spec is not None and nxt_spec.kind == "gate" and nxt_spec.entry_conditional:
                    # 진입 조건부 gate(compress) — 이미 충족이면 건너뜀.
                    # entry_conditional=False(evaluate)는 무조건 진입 후 판정(아래 add_edge).
                    gate_after = (out_edges[nxt] or [END])[0]
                    assert nxt_spec.gate_router is not None
                    g.add_conditional_edges(
                        nid, nxt_spec.gate_router(gate_after), {"loop": nxt, "next": gate_after}
                    )
                else:
                    g.add_edge(nid, nxt)
    return g


# flow(nodes+edges)별 컴파일 그래프 캐시 — 같은 구성은 1회만 컴파일 (매 요청 컴파일 방지)
_graph_cache: dict[tuple, object] = {}


def get_item_graph(nodes: tuple[str, ...] | None = None, edges: tuple = ()):
    """flow(nodes+edges)별 컴파일된 항목 서브그래프 (캐시).

    edges 미지정 시 nodes 순서대로 선형(하위호환). edges 지정 시 임의 DAG·루프 (ADR-030 4c).
    """
    node_key = tuple(nodes) if nodes else tuple(DEFAULT_ITEM_FLOW)
    edge_key = tuple(tuple(e) for e in edges)
    key = (node_key, edge_key)
    if key not in _graph_cache:
        wf = WorkflowDef(list(node_key), [list(e) for e in edge_key])
        _graph_cache[key] = build_item_graph(wf).compile()
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
                flow_edges=state.get("flow_edges") or [],
                refine_enabled=state.get("refine_enabled", False),
                refine_iteration=0,
                rag_context=[],
                rag_sources={},
                rag_citations=[],
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

    result = await get_item_graph(
        tuple(item_state["flow"]),
        tuple(tuple(e) for e in item_state.get("flow_edges") or []),
    ).ainvoke(item_state)
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
