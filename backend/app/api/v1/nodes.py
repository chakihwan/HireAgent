"""대화형 단계 실행 — 노드 단위 실행 API (ADR-031 단계 A).

자동 배치(LangGraph 전체 실행)와 달리, 노드 하나를 단독 실행해 후보를 돌려준다.
프론트(캔버스)가 노드를 하나씩 호출하고 사용자가 후보를 비교·택1한다.
"""

import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.jd_analyzer import jd_analyzer_node
from app.api.v1.essays import _resolve_api_key
from app.db import get_db
from app.schemas.node import (
    JDAnalyzeCandidate,
    JDAnalyzeRequest,
    JDAnalyzeResponse,
    ModelChoice,
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
