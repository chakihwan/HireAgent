"""대화형 단계 실행 — 노드 단위 실행 API (ADR-031 단계 A).

자동 배치(LangGraph 전체 실행)와 달리, 노드 하나를 단독 실행해 후보를 돌려준다.
프론트(캔버스)가 노드를 하나씩 호출하고 사용자가 후보를 비교·택1한다.
"""

import asyncio
import re

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.essay_writer import essay_writer_node
from app.agents.jd_analyzer import jd_analyzer_node
from app.api.v1.essays import _resolve_api_key
from app.db import AsyncSessionLocal, get_db
from app.rag.retriever import search_grouped_by_project
from app.schemas.node import (
    CoverageMatch,
    CoverageRequest,
    CoverageResponse,
    JDAnalyzeCandidate,
    JDAnalyzeRequest,
    JDAnalyzeResponse,
    ModelChoice,
    RagSearchRequest,
    RagSearchResponse,
    RagSource,
    RequirementCoverage,
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
    """직무 분석 기반으로 내 경험(청크)을 검색 → 뉴런 큐레이션 (ADR-031 D, 항목 무관).

    "내 경험"은 항목과 무관하게 직무 전체에 맞는 경험을 가져온다. 프로젝트별 대표 청크를
    고르게 뽑아(한 레포 독식 방지) 프론트가 프로젝트=허브 뉴런 + 청크=위성으로 시각화한다.
    """
    async with AsyncSessionLocal() as db:
        rows = await search_grouped_by_project(
            db, query=req.jd_analysis, user_id=req.user_id, per_project=5
        )
    sources = [
        RagSource(
            content=content,
            source_type=source_type,
            project_name=project_name,
            snippet=" ".join(content[:90].split()),
            similarity=round(1 - dist, 3),
        )
        for content, source_type, project_name, dist in rows
    ]
    return RagSearchResponse(sources=sources)


# ── 직무 충족도 지도 (ADR-032) ──────────────────────────────────

# jd_analyzer가 출력한 "## 핵심 요구 역량" 불릿을 추출 (LLM 미사용 — 결정론적).
_REQ_SECTION = re.compile(r"##\s*핵심\s*요구\s*역량\s*\n(.*?)(?:\n##|\Z)", re.DOTALL)
_BULLET = re.compile(r"^\s*[-•*]\s*(.+?)\s*$", re.MULTILINE)
_TRAIL_PAREN = re.compile(r"\s*[(（][^)）]*[)）]\s*$")


def _extract_requirements(jd_analysis: str) -> list[str]:
    """JD 분석 텍스트에서 핵심 요구 역량 불릿을 뽑는다 (최대 5개)."""
    m = _REQ_SECTION.search(jd_analysis)
    block = m.group(1) if m else ""
    reqs: list[str] = []
    for b in _BULLET.findall(block):
        cleaned = _TRAIL_PAREN.sub("", b).strip()
        if cleaned:
            reqs.append(cleaned)
    return reqs[:5]


@router.post("/coverage/run", response_model=CoverageResponse)
async def run_coverage(req: CoverageRequest) -> CoverageResponse:
    """직무 핵심 요구 ↔ 내 경험 매칭 (ADR-032).

    요구는 JD 분석의 "핵심 요구 역량" 불릿에서 정규식으로 추출(LLM 미사용).
    요구마다 프로젝트별 최적 청크를 찾아 매칭 점수를 매긴다 → 프론트가 충족도 지도로 시각화.
    매칭이 약한 요구 = "보강 필요"(직무가 원하지만 내 경험에 부족한 영역).
    """
    requirements = _extract_requirements(req.jd_analysis)
    if not requirements:
        return CoverageResponse(requirements=[])

    async with AsyncSessionLocal() as db:
        out: list[RequirementCoverage] = []
        for text in requirements:
            rows = await search_grouped_by_project(
                db, query=text, user_id=req.user_id, per_project=1
            )
            matches = [
                CoverageMatch(
                    project_name=project_name,
                    source_type=source_type,
                    similarity=round(1 - dist, 3),
                )
                for _content, source_type, project_name, dist in rows
            ]
            matches.sort(key=lambda m: m.similarity, reverse=True)
            out.append(RequirementCoverage(text=text, matches=matches))
    return CoverageResponse(requirements=out)
