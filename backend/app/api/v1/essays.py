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
from app.services import settings as settings_svc

router = APIRouter(prefix="/essays", tags=["essays"])


async def _resolve_api_key(
    db: AsyncSession | None, user_id: str, provider: str, body_key: str | None
) -> str:
    """API 키 해석. ollama는 서버 URL, 클라우드는 body 우선·없으면 DB 복호화.

    프론트가 평문 키를 요청 body로 보내지 않아도(Rule #2) DB에 암호화된 키를
    복호화해 사용한다. body_key가 오면(과도기 하위호환) 그것을 우선.
    복호화된 평문은 그래프 실행 동안 agent_config dict에만 머물고 로그·응답엔 싣지 않는다.
    """
    if provider == "ollama":
        return body_key or settings.ollama_base_url
    if body_key:
        return body_key
    if db is None:
        return ""
    key = await settings_svc.get_decrypted_key(db, user_id, provider)
    return key or ""


async def _build_agent_config(req: EssayGenerateRequest, db: AsyncSession | None) -> dict:
    """요청의 agent_config를 dict로 변환. 키는 _resolve_api_key로 해석(DB 복호화 포함)."""
    config: dict = {}
    for agent_name, assignment in req.agent_config.items():
        api_key = await _resolve_api_key(
            db, req.user_id, assignment.provider, assignment.api_key
        )
        config[agent_name] = {
            "provider": assignment.provider,
            "model": assignment.model,
            "api_key": api_key,
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


async def _build_items(
    req: EssayGenerateRequest, global_config: dict, db: AsyncSession | None
) -> list[EssayItem]:
    """요청의 items 리스트를 EssayItem으로 변환. 항목별 agent_config 오버라이드 처리."""
    items: list[EssayItem] = []
    for item in req.items:
        essay_item = EssayItem(
            category=item.category,
            char_limit=item.char_limit,
            tone=item.tone,
            persona=item.persona,
        )
        if item.agent_config:
            item_cfg: dict = {}
            for agent_name, assignment in item.agent_config.items():
                api_key = await _resolve_api_key(
                    db, req.user_id, assignment.provider, assignment.api_key
                )
                item_cfg[agent_name] = {
                    "provider": assignment.provider,
                    "model": assignment.model,
                    "api_key": api_key,
                }
            essay_item["agent_config"] = {**global_config, **item_cfg}
        items.append(essay_item)
    return items


async def _stream_generation(
    req: EssayGenerateRequest,
    save: bool = False,
    application_id: int | None = None,
    db: AsyncSession | None = None,
) -> AsyncGenerator[str, None]:
    agent_config = await _build_agent_config(req, db)
    items = await _build_items(req, agent_config, db)

    initial_state = EssayState(
        job_description=req.job_description,
        items=items,
        agent_config=agent_config,
        user_id=req.user_id,
        flow=req.flow or [],
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

    try:
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
    except Exception as e:
        # LLM 호출 실패(429 등)로 그래프가 중단되면 스트림을 깔끔히 error로 닫는다.
        # try/except가 없으면 예외가 generator 밖으로 나가 ERR_INCOMPLETE_CHUNKED_ENCODING이 된다.
        yield _sse("error", {"message": _format_llm_error(e)})
        return

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
            evaluation_scores=d.get("evaluation_scores"),
            draft_history=d.get("draft_history") or [],
            rag_citations=d.get("rag_citations") or [],
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


def _format_llm_error(e: Exception) -> str:
    """LLM 호출 예외를 사용자 친화 메시지로. 평문 키 등 민감정보는 싣지 않는다."""
    msg = str(e)
    upper = msg.upper()
    if "429" in msg or "RESOURCE_EXHAUSTED" in upper:
        return (
            "LLM 호출 할당량 초과 (429). 무료 티어 분당/일일 한도일 수 있어요. "
            "잠시 후 다시 시도하거나, 일부 노드를 ollama로 바꿔 호출 수를 줄여보세요."
        )
    if "401" in msg or "403" in msg or "API_KEY" in upper or "UNAUTHENT" in upper:
        return "LLM 인증 실패 — API 키를 확인하세요 (모델 관리에서 키 재저장)."
    if "503" in msg or "UNAVAILABLE" in upper:
        return "LLM 서버 일시 과부하 (503). 잠시 후 다시 시도해 주세요."
    return f"생성 중 오류가 발생했습니다: {msg[:200]}"


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
async def generate_essays_sync(
    req: EssayGenerateRequest, db: AsyncSession = Depends(get_db)
) -> EssayGenerateResponse:
    """자소서 생성 (동기 응답, 테스트/디버깅용)."""
    agent_config = await _build_agent_config(req, db)
    items = await _build_items(req, agent_config, db)

    initial_state = EssayState(
        job_description=req.job_description,
        items=items,
        agent_config=agent_config,
        user_id=req.user_id,
        flow=req.flow or [],
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
            evaluation_scores=d.get("evaluation_scores"),
            draft_history=d.get("draft_history") or [],
        )
        for d in final.get("drafts", [])
    ]
    return EssayGenerateResponse(drafts=drafts, progress=final.get("progress", []))
