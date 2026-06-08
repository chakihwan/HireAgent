from pydantic import BaseModel, Field


class LLMKeyUpdate(BaseModel):
    """API 키 저장 요청. 평문 키는 이 요청 body로만 1회 전달되고, 백엔드가
    즉시 Fernet 암호화해 DB에 저장한다 (CLAUDE.md Rule #2)."""

    provider: str = Field(..., description="anthropic | openai | google")
    api_key: str = Field(..., min_length=1)


class LLMKeyInfo(BaseModel):
    """저장된 키 정보 — 평문은 절대 노출하지 않고 마스킹된 형태만 반환."""

    provider: str
    masked: str  # 예: 'AIzaSy***1B2c'


class LLMKeysResponse(BaseModel):
    keys: list[LLMKeyInfo]
