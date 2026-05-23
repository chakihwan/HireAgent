from langgraph.graph import END, StateGraph
from langgraph.types import Send

from app.agents.compressor import compressor_node
from app.agents.essay_writer import essay_writer_node
from app.agents.evaluator import evaluator_node
from app.agents.jd_analyzer import jd_analyzer_node
from app.agents.state import Draft, EssayItem, EssayState, ItemState
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
    g.add_node("write", essay_writer_node)
    g.add_node("compress", compressor_node)
    g.add_node("evaluate", evaluator_node)

    g.set_entry_point("write")
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
                agent_config=state["agent_config"],
                user_id=state["user_id"],
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
    result = await _item_graph.ainvoke(item_state)
    draft = Draft(
        category=result["item"]["category"],
        content=result["content"],
        char_count=result["char_count"],
        iteration=result.get("iteration", 1),
        evaluation_score=result.get("evaluation_score"),
        evaluation_feedback=result.get("evaluation_feedback"),
    )
    return {
        "drafts": [draft],
        "progress": [
            f"✅ {draft['category']} 완료 "
            f"({draft['char_count']}자, 평가 {draft['evaluation_score'] or '-'}점)"
        ],
    }


def _build_main_graph() -> StateGraph:
    g = StateGraph(EssayState)
    g.add_node("jd_analyzer", jd_analyzer_node)
    g.add_node("_process_item", _process_item)

    g.set_entry_point("jd_analyzer")
    g.add_conditional_edges("jd_analyzer", _fan_out, ["_process_item"])
    g.add_edge("_process_item", END)
    return g


essay_graph = _build_main_graph().compile()
