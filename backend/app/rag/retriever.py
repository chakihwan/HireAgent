"""RAG 검색기 — pgvector 코사인 거리 기반 유사 청크 조회.

user_id 필터 필수 (CLAUDE.md Rule #4).
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_document import CareerDocument
from app.rag.embeddings import embed_text


async def search(
    db: AsyncSession,
    *,
    query: str,
    user_id: str,
    limit: int = 5,
    source_type: str | None = None,
    category: str | None = None,
    project_name: str | None = None,
) -> list[tuple[CareerDocument, float]]:
    """쿼리 텍스트와 유사한 career_documents 청크 반환.

    Returns: [(document, distance)] 리스트. distance는 코사인 거리 (작을수록 유사).
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

    stmt = stmt.order_by(distance).limit(limit)

    result = await db.execute(stmt)
    return [(row[0], float(row[1])) for row in result.all()]
