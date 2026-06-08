from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.settings import LLMKeyInfo, LLMKeysResponse, LLMKeyUpdate
from app.services import settings as settings_svc

router = APIRouter(prefix="/settings", tags=["settings"])

_USER_ID = "local"  # Phase 1: 단일 사용자


@router.put("/llm-keys", status_code=204)
async def save_llm_key(
    data: LLMKeyUpdate, db: AsyncSession = Depends(get_db)
) -> None:
    """프로바이더 API 키를 Fernet 암호화해 DB에 저장 (provider별 upsert)."""
    await settings_svc.set_key(db, _USER_ID, data.provider, data.api_key)


@router.get("/llm-keys", response_model=LLMKeysResponse)
async def get_llm_keys(db: AsyncSession = Depends(get_db)) -> LLMKeysResponse:
    """저장된 키 목록 (마스킹). 평문은 절대 반환하지 않는다."""
    keys = await settings_svc.list_keys_masked(db, _USER_ID)
    return LLMKeysResponse(
        keys=[LLMKeyInfo(provider=p, masked=m) for p, m in keys]
    )


@router.delete("/llm-keys/{provider}", status_code=204)
async def delete_llm_key(
    provider: str, db: AsyncSession = Depends(get_db)
) -> None:
    await settings_svc.delete_key(db, _USER_ID, provider)
