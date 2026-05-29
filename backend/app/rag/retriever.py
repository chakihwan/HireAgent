"""RAG 검색기 — pgvector 코사인 거리 기반 유사 청크 조회.

user_id 필터 필수 (CLAUDE.md Rule #4).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_document import CareerDocument
from app.rag.embeddings import embed_text

# source_type별 기본 가중치 (거리에 곱해지는 계수, 작을수록 우선).
# 프로젝트 문서는 집중된 기술 경험이라 우대, 이력서는 잡다한 경력(무관 직무·연락처 등)이
# 섞여 있어 중립. (피드백: 학교/회사 프로젝트와 무관 경력이 무작위 혼합되던 문제)
_DEFAULT_SOURCE_WEIGHTS: dict[str, float] = {
    "project_readme": 0.80,
    "project_doc": 0.85,
    "essay": 0.95,
    "resume": 1.0,
    "custom": 1.0,
}

# 지원동기·입사 후 포부 등 동기/포부 항목은 과거 자소서(essay)·이력서 서사를 우대.
_MOTIVATION_SOURCE_WEIGHTS: dict[str, float] = {
    "essay": 0.75,
    "resume": 0.90,
    "project_readme": 0.95,
    "project_doc": 0.95,
    "custom": 1.0,
}

_MOTIVATION_KEYWORDS = ("지원동기", "지원 동기", "입사", "포부", "비전", "목표")


def source_weights_for_category(category: str) -> dict[str, float]:
    """자소서 항목 카테고리에 맞는 source_type 가중치 맵 반환."""
    if any(k in category for k in _MOTIVATION_KEYWORDS):
        return _MOTIVATION_SOURCE_WEIGHTS
    return _DEFAULT_SOURCE_WEIGHTS


async def search(
    db: AsyncSession,
    *,
    query: str,
    user_id: str,
    limit: int = 5,
    source_type: str | None = None,
    category: str | None = None,
    project_name: str | None = None,
    source_weights: dict[str, float] | None = None,
    candidate_multiplier: int = 4,
) -> list[tuple[CareerDocument, float]]:
    """쿼리 텍스트와 유사한 career_documents 청크 반환.

    source_weights가 주어지면 후보 풀(limit × candidate_multiplier)을 받아
    source_type별 가중치를 거리에 곱해 재정렬한 뒤 상위 limit개를 반환한다.
    반환되는 distance는 가중치 적용 전 원본 코사인 거리 (작을수록 유사).
    """
    query_embedding = await embed_text(query)

    distance = CareerDocument.embedding.cosine_distance(query_embedding)
    stmt = select(CareerDocument, distance).where(CareerDocument.user_id == user_id)

    if source_type:
        stmt = stmt.where(CareerDocument.source_type == source_type)
    if category:
        stmt = stmt.where(CareerDocument.category == category)
    if project_name:
        stmt = stmt.where(CareerDocument.project_name == project_name)

    if source_weights:
        # 후보 풀을 넓게 받아 Python에서 가중 재랭킹
        stmt = stmt.order_by(distance).limit(limit * candidate_multiplier)
        result = await db.execute(stmt)
        rows = [(row[0], float(row[1])) for row in result.all()]
        rows.sort(key=lambda r: r[1] * source_weights.get(r[0].source_type, 1.0))
        return rows[:limit]

    stmt = stmt.order_by(distance).limit(limit)
    result = await db.execute(stmt)
    return [(row[0], float(row[1])) for row in result.all()]
