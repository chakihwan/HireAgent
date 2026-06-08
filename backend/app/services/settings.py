"""사용자 LLM API 키 관리 서비스.

CLAUDE.md Rule #2: 키는 Fernet 암호화 후 DB(user_llm_configs.encrypted_keys)에 저장.
- 저장: 평문 → encrypt_api_key → JSONB
- 조회(UI): 복호화 → mask_key (평문 절대 반환 X)
- 사용(생성): 복호화한 평문을 호출자에게 반환하되, 호출자는 사용 직후 메모리에서 제거
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_llm_config import UserLLMConfig
from app.utils.crypto import decrypt_api_key, encrypt_api_key, mask_key

_DEFAULT_USER = "local"  # Phase 1: 단일 사용자


async def _get_or_create(db: AsyncSession, user_id: str) -> UserLLMConfig:
    cfg = await db.get(UserLLMConfig, user_id)
    if cfg is None:
        cfg = UserLLMConfig(user_id=user_id, encrypted_keys={}, agent_assignments={})
        db.add(cfg)
    return cfg


async def set_key(
    db: AsyncSession, user_id: str, provider: str, plaintext: str
) -> None:
    """평문 키를 암호화해 저장 (provider별 upsert)."""
    cfg = await _get_or_create(db, user_id)
    # JSONB dict는 새 객체를 할당해야 SQLAlchemy가 변경을 감지한다 (in-place 변경 미감지)
    keys = dict(cfg.encrypted_keys or {})
    keys[provider] = encrypt_api_key(plaintext)
    cfg.encrypted_keys = keys
    await db.commit()


async def list_keys_masked(
    db: AsyncSession, user_id: str = _DEFAULT_USER
) -> list[tuple[str, str]]:
    """저장된 키들을 (provider, 마스킹) 목록으로 반환. 평문 노출 없음."""
    cfg = await db.get(UserLLMConfig, user_id)
    if cfg is None or not cfg.encrypted_keys:
        return []
    result: list[tuple[str, str]] = []
    for provider, enc in cfg.encrypted_keys.items():
        try:
            plain = decrypt_api_key(enc)
            result.append((provider, mask_key(plain)))
            del plain  # 마스킹 후 즉시 제거
        except ValueError:
            result.append((provider, "복호화 실패 (키 교체됨?)"))
    return result


async def get_decrypted_key(
    db: AsyncSession, user_id: str, provider: str
) -> str | None:
    """생성 플로우용 — 평문 키 복호화 반환. 호출자는 사용 직후 `del`로 제거할 것."""
    cfg = await db.get(UserLLMConfig, user_id)
    if cfg is None or not cfg.encrypted_keys:
        return None
    enc = cfg.encrypted_keys.get(provider)
    if not enc:
        return None
    return decrypt_api_key(enc)


async def delete_key(
    db: AsyncSession, user_id: str, provider: str
) -> None:
    cfg = await db.get(UserLLMConfig, user_id)
    if cfg is None or not cfg.encrypted_keys:
        return
    keys = dict(cfg.encrypted_keys)
    keys.pop(provider, None)
    cfg.encrypted_keys = keys
    await db.commit()
