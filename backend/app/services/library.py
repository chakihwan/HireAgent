from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.essay_library import EssayLibraryItem
from app.schemas.library import EssayLibraryCreate, EssayLibraryUpdate

_DEFAULT_USER = "local"


async def save_essay(
    db: AsyncSession, data: EssayLibraryCreate, user_id: str = _DEFAULT_USER
) -> EssayLibraryItem:
    char_count = len(data.content)

    # 같은 application + category 에 이미 항목이 있으면 version 증가
    if data.application_id is not None:
        stmt = (
            select(EssayLibraryItem.version)
            .where(
                EssayLibraryItem.user_id == user_id,
                EssayLibraryItem.application_id == data.application_id,
                EssayLibraryItem.category == data.category,
            )
            .order_by(EssayLibraryItem.version.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        last_version = result.scalar_one_or_none()
        version = (last_version or 0) + 1
    else:
        version = 1

    item = EssayLibraryItem(
        user_id=user_id,
        application_id=data.application_id,
        category=data.category,
        content=data.content,
        char_count=char_count,
        char_target=data.char_target,
        tone=data.tone,
        persona=data.persona,
        version=version,
        is_final=data.is_final,
        generation_metadata=data.generation_metadata,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def list_essays(
    db: AsyncSession,
    user_id: str = _DEFAULT_USER,
    application_id: int | None = None,
    category: str | None = None,
    is_final: bool | None = None,
) -> list[EssayLibraryItem]:
    stmt = select(EssayLibraryItem).where(EssayLibraryItem.user_id == user_id)
    if application_id is not None:
        stmt = stmt.where(EssayLibraryItem.application_id == application_id)
    if category:
        stmt = stmt.where(EssayLibraryItem.category == category)
    if is_final is not None:
        stmt = stmt.where(EssayLibraryItem.is_final == is_final)
    stmt = stmt.order_by(EssayLibraryItem.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_essay(
    db: AsyncSession, item_id: int, user_id: str = _DEFAULT_USER
) -> EssayLibraryItem | None:
    stmt = select(EssayLibraryItem).where(
        EssayLibraryItem.id == item_id, EssayLibraryItem.user_id == user_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_essay(
    db: AsyncSession, item_id: int, data: EssayLibraryUpdate, user_id: str = _DEFAULT_USER
) -> EssayLibraryItem | None:
    item = await get_essay(db, item_id, user_id)
    if not item:
        return None
    if data.content is not None:
        item.content = data.content
        item.char_count = len(data.content)
    if data.is_final is not None:
        item.is_final = data.is_final
    if data.generation_metadata is not None:
        item.generation_metadata = data.generation_metadata
    await db.commit()
    await db.refresh(item)
    return item


async def delete_essay(
    db: AsyncSession, item_id: int, user_id: str = _DEFAULT_USER
) -> bool:
    item = await get_essay(db, item_id, user_id)
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True
