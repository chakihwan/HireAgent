import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.orchestrator import essay_graph
from app.agents.state import EssayItem, EssayState
from app.config import settings
from app.db import get_db
from app.schemas.essay import DraftResult, EssayGenerateRequest, EssayGenerateResponse
from app.schemas.library import EssayLibraryCreate
from app.services import library as lib_svc

router = APIRouter(prefix="/essays", tags=["essays"])


def _build_agent_config(req: EssayGenerateRequest) -> dict:
    """요청의 agent_config를 dict 형태로 변환. Ollama api_key 기본값 주입."""
    config: dict = {}
    for agent_name, assignment in req.agent_config.items():
        api_key = assignment.api_key
        if assignment.provider == "ollama" and not api_key:
            api_key = settings.ollama_base_url
        config[agent_name] = {
            "provider": assignment.provider,
            "model": assignment.model,
            "api_key": api_key or "",
        }
    # 지정되지 않은 에이전트는 Ollama 기본값
    for agent in ("jd_analyzer", "essay_writer", "compressor", "evaluator"):
        if agent not in config:
            config[agent] = {
                "provider": "ollama",
                "model": "exaone3.5:7.8b",
                "api_key": settings.ollama_base_url,
            }
    return config


async def _stream_generation(
    req: EssayGenerateRequest,
    save: bool = False,
    application_id: int | None = None,
    db: AsyncSession | None = None,
) -> AsyncGenerator[str, None]:
    agent_config = _build_agent_config(req)
    items: list[EssayItem] = [
        EssayItem(
            category=item.category,
            char_limit=item.char_limit,
            tone=item.tone,
            persona=item.persona,
        )
        for item in req.items
    ]

    initial_state = EssayState(
        job_description=req.job_description,
        items=items,
        agent_config=agent_config,
        user_id=req.user_id,
        jd_analysis="",
        target_company="",
        drafts=[],
        progress=[],
        node_events=[],
        errors=[],
    )

    yield _sse("start", {"message": "자소서 생성을 시작합니다.", "total_items": len(items)})

    # astream으로 한 번만 실행하면서 reducer로 누적된 drafts를 직접 추출
    # (예전: astream + ainvoke 따로 호출 → 그래프 2회 실행 + 결과 불일치)
    accumulated_drafts: list[dict] = []
    accumulated_progress: list[str] = []
    accumulated_errors: list[str] = []

    async for event in essay_graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_output in event.items():
            for msg in node_output.get("progress", []):
                accumulated_progress.append(msg)
                yield _sse("progress", {"node": node_name, "message": msg})
            for err in node_output.get("errors", []):
                accumulated_errors.append(err)
                yield _sse("error", {"message": err})
            for draft in node_output.get("drafts", []):
                accumulated_drafts.append(draft)
            for ne in node_output.get("node_events", []):
                yield _sse("node_event", ne)

    char_targets = {item.category: item.char_limit for item in req.items}
    drafts = [
        DraftResult(
            category=d["category"],
            content=d["content"],
            char_count=d["char_count"],
            char_target=char_targets.get(d["category"], 0),
            iteration=d["iteration"],
            evaluation_score=d.get("evaluation_score"),
            evaluation_feedback=d.get("evaluation_feedback"),
        )
        for d in accumulated_drafts
    ]

    saved_ids: list[int] = []
    if save and db is not None:
        for draft in drafts:
            item = await lib_svc.save_essay(
                db,
                EssayLibraryCreate(
                    application_id=application_id,
                    category=draft.category,
                    content=draft.content,
                    char_target=draft.char_target,
                    generation_metadata={
                        "evaluation_score": draft.evaluation_score,
                        "evaluation_feedback": draft.evaluation_feedback,
                        "iterations": draft.iteration,
                        "agent_config": req.agent_config,
                    },
                ),
                req.user_id,
            )
            saved_ids.append(item.id)

    response_data = EssayGenerateResponse(drafts=drafts, progress=accumulated_progress).model_dump()
    if saved_ids:
        response_data["saved_ids"] = saved_ids
    yield _sse("done", response_data)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/generate")
async def generate_essays(
    req: EssayGenerateRequest,
    save: bool = False,
    application_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """자소서 생성 (SSE 스트리밍).

    진행 단계별 event: start → progress → done (또는 error)
    save=true 시 done 이벤트에서 라이브러리에 자동 저장.
    """
    return StreamingResponse(
        _stream_generation(req, save=save, application_id=application_id, db=db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/generate/sync", response_model=EssayGenerateResponse)
async def generate_essays_sync(req: EssayGenerateRequest) -> EssayGenerateResponse:
    """자소서 생성 (동기 응답, 테스트/디버깅용)."""
    agent_config = _build_agent_config(req)
    items: list[EssayItem] = [
        EssayItem(
            category=item.category,
            char_limit=item.char_limit,
            tone=item.tone,
            persona=item.persona,
        )
        for item in req.items
    ]

    initial_state = EssayState(
        job_description=req.job_description,
        items=items,
        agent_config=agent_config,
        user_id=req.user_id,
        jd_analysis="",
        target_company="",
        drafts=[],
        progress=[],
        node_events=[],
        errors=[],
    )

    final = await essay_graph.ainvoke(initial_state)
    char_targets = {item.category: item.char_limit for item in req.items}
    drafts = [
        DraftResult(
            category=d["category"],
            content=d["content"],
            char_count=d["char_count"],
            char_target=char_targets.get(d["category"], 0),
            iteration=d["iteration"],
            evaluation_score=d.get("evaluation_score"),
            evaluation_feedback=d.get("evaluation_feedback"),
        )
        for d in final.get("drafts", [])
    ]
    return EssayGenerateResponse(drafts=drafts, progress=final.get("progress", []))
