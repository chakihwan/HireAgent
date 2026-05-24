from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_document import CareerDocument

_DEFAULT_USER = "local"


async def list_documents(
    db: AsyncSession,
    user_id: str = _DEFAULT_USER,
    source_type: str | None = None,
    project_name: str | None = None,
) -> list[CareerDocument]:
    stmt = select(CareerDocument).where(CareerDocument.user_id == user_id)
    if source_type:
        stmt = stmt.where(CareerDocument.source_type == source_type)
    if project_name:
        stmt = stmt.where(CareerDocument.project_name == project_name)
    stmt = stmt.order_by(CareerDocument.indexed_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_document(
    db: AsyncSession, doc_id: int, user_id: str = _DEFAULT_USER
) -> CareerDocument | None:
    stmt = select(CareerDocument).where(
        CareerDocument.id == doc_id, CareerDocument.user_id == user_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def delete_document(
    db: AsyncSession, doc_id: int, user_id: str = _DEFAULT_USER
) -> bool:
    doc = await get_document(db, doc_id, user_id)
    if not doc:
        return False
    await db.delete(doc)
    await db.commit()
    return True


async def delete_by_project(
    db: AsyncSession, project_name: str, user_id: str = _DEFAULT_USER
) -> int:
    """같은 project_name의 모든 청크 삭제. 삭제된 개수 반환."""
    stmt = select(CareerDocument).where(
        CareerDocument.user_id == user_id,
        CareerDocument.project_name == project_name,
    )
    result = await db.execute(stmt)
    docs = list(result.scalars().all())
    for doc in docs:
        await db.delete(doc)
    await db.commit()
    return len(docs)
