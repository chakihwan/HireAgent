"""대화형 단계 실행 — 노드 단위 실행 API (ADR-031 단계 A).

자동 배치(LangGraph 전체 실행)와 달리, 노드 하나를 단독 실행해 후보를 돌려준다.
프론트(캔버스)가 노드를 하나씩 호출하고 사용자가 후보를 비교·택1한다.
"""

import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.essay_writer import essay_writer_node
from app.agents.jd_analyzer import jd_analyzer_node
from app.agents.rag_retriever import rag_retriever_node
from app.api.v1.essays import _resolve_api_key
from app.db import get_db
from app.schemas.node import (
    JDAnalyzeCandidate,
    JDAnalyzeRequest,
    JDAnalyzeResponse,
    ModelChoice,
    RagSearchRequest,
    RagSearchResponse,
    RagSource,
    WriteCandidate,
    WriteRequest,
    WriteResponse,
)

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.post("/jd-analyze/run", response_model=JDAnalyzeResponse)
async def run_jd_analyze(
    req: JDAnalyzeRequest, db: AsyncSession = Depends(get_db)
) -> JDAnalyzeResponse:
    """JD 분석을 N개 모델로 각각 실행 → 후보 N개 (N=모델 다양화, ADR-031 #3).

    각 모델로 독립 실행(병렬)하고, 사용자가 캔버스에서 비교해 가장 잘 분석한 것을 택1한다.
    """

    async def _one(mc: ModelChoice) -> JDAnalyzeCandidate:
        api_key = await _resolve_api_key(db, req.user_id, mc.provider, mc.api_key)
        # jd_analyzer_node는 EssayState의 job_description·agent_config만 읽는다 (부분 state로 충분).
        state = {
            "job_description": req.job_description,
            "agent_config": {
                "jd_analyzer": {
                    "provider": mc.provider,
                    "model": mc.model,
                    "api_key": api_key,
                }
            },
        }
        result = await jd_analyzer_node(state)  # type: ignore[arg-type]
        return JDAnalyzeCandidate(
            jd_analysis=result["jd_analysis"],
            target_company=result["target_company"],
            provider=mc.provider,
            model=mc.model,
        )

    candidates = await asyncio.gather(*[_one(mc) for mc in req.models])
    return JDAnalyzeResponse(candidates=list(candidates))


@router.post("/write/run", response_model=WriteResponse)
async def run_write(
    req: WriteRequest, db: AsyncSession = Depends(get_db)
) -> WriteResponse:
    """선택한 JD 분석으로 자소서 초안을 N개 모델로 작성 → 후보 N개 (ADR-031 C).

    rag_context가 비면 분석만으로 작성 (RAG 큐레이션은 단계 D).
    """

    async def _one(mc: ModelChoice) -> WriteCandidate:
        api_key = await _resolve_api_key(db, req.user_id, mc.provider, mc.api_key)
        state = {
            "item": {
                "category": req.category,
                "char_limit": req.char_limit,
                "tone": req.tone,
                "persona": req.persona,
            },
            "jd_analysis": req.jd_analysis,
            "target_company": req.target_company,
            "rag_context": req.rag_context,
            "tech_whitelist": [],
            "agent_config": {
                "essay_writer": {
                    "provider": mc.provider,
                    "model": mc.model,
                    "api_key": api_key,
                }
            },
        }
        result = await essay_writer_node(state)  # type: ignore[arg-type]
        return WriteCandidate(
            content=result["content"],
            char_count=result["char_count"],
            provider=mc.provider,
            model=mc.model,
        )

    candidates = await asyncio.gather(*[_one(mc) for mc in req.models])
    return WriteResponse(candidates=list(candidates))


@router.post("/rag/search", response_model=RagSearchResponse)
async def run_rag_search(req: RagSearchRequest) -> RagSearchResponse:
    """JD분석 기반으로 관련 경험(청크)을 검색 → 큐레이션 후보 (ADR-031 D).

    자동 검색 결과를 돌려주고, 사용자가 인용할 청크를 고른다(기본=전부 사용).
    """
    state = {
        "item": {"category": req.category},
        "jd_analysis": req.jd_analysis,
        "user_id": req.user_id,
    }
    result = await rag_retriever_node(state)  # type: ignore[arg-type]
    contexts = result.get("rag_context", [])
    cites = result.get("rag_citations", [])
    sources = [RagSource(content=ctx, **cite) for ctx, cite in zip(contexts, cites)]
    return RagSearchResponse(sources=sources)
