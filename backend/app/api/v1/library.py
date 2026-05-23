from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.library import EssayLibraryCreate, EssayLibraryResponse, EssayLibraryUpdate
from app.services import library as lib_svc

router = APIRouter(prefix="/library", tags=["library"])

_USER_ID = "local"  # Phase 1: 단일 사용자


@router.post("", response_model=EssayLibraryResponse, status_code=201)
async def save_essay(
    data: EssayLibraryCreate, db: AsyncSession = Depends(get_db)
) -> EssayLibraryResponse:
    item = await lib_svc.save_essay(db, data, _USER_ID)
    return EssayLibraryResponse.model_validate(item)


@router.get("", response_model=list[EssayLibraryResponse])
async def list_essays(
    application_id: int | None = None,
    category: str | None = None,
    is_final: bool | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[EssayLibraryResponse]:
    items = await lib_svc.list_essays(db, _USER_ID, application_id, category, is_final)
    return [EssayLibraryResponse.model_validate(i) for i in items]


@router.get("/{item_id}", response_model=EssayLibraryResponse)
async def get_essay(item_id: int, db: AsyncSession = Depends(get_db)) -> EssayLibraryResponse:
    item = await lib_svc.get_essay(db, item_id, _USER_ID)
    if not item:
        raise HTTPException(status_code=404, detail="Essay not found")
    return EssayLibraryResponse.model_validate(item)


@router.patch("/{item_id}", response_model=EssayLibraryResponse)
async def update_essay(
    item_id: int, data: EssayLibraryUpdate, db: AsyncSession = Depends(get_db)
) -> EssayLibraryResponse:
    item = await lib_svc.update_essay(db, item_id, data, _USER_ID)
    if not item:
        raise HTTPException(status_code=404, detail="Essay not found")
    return EssayLibraryResponse.model_validate(item)


@router.delete("/{item_id}", status_code=204)
async def delete_essay(item_id: int, db: AsyncSession = Depends(get_db)) -> None:
    deleted = await lib_svc.delete_essay(db, item_id, _USER_ID)
    if not deleted:
        raise HTTPException(status_code=404, detail="Essay not found")
