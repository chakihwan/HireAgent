import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.llm.factory import LLMFactory
from app.schemas.settings import (
    CloudModelsResponse,
    LLMKeyInfo,
    LLMKeysResponse,
    LLMKeyUpdate,
)
from app.services import settings as settings_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

_USER_ID = "local"  # Phase 1: 단일 사용자
_CLOUD_PROVIDERS = ("anthropic", "openai", "google")


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


@router.get("/cloud-models", response_model=CloudModelsResponse)
async def get_cloud_models(db: AsyncSession = Depends(get_db)) -> CloudModelsResponse:
    """저장된 키가 있는 provider의 모델 목록을 동적 조회 (ListModels).

    키 없는 provider는 생략 → 프론트가 하드코딩 fallback을 쓴다.
    조회 실패(잘못된 키 등)도 생략. 평문 키는 사용 직후 제거.
    """
    result: dict[str, list[str]] = {}
    for provider in _CLOUD_PROVIDERS:
        key = await settings_svc.get_decrypted_key(db, _USER_ID, provider)
        if not key:
            continue
        try:
            p = LLMFactory.create(provider, "", key)
            models = await p.list_models()
            if models:
                result[provider] = models
        except Exception as e:
            logger.warning("cloud-models 조회 실패 (%s): %s", provider, str(e)[:120])
        finally:
            del key
    return CloudModelsResponse(models=result)
