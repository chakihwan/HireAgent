from pydantic import BaseModel, Field


class LLMTestRequest(BaseModel):
    provider: str = Field(..., description="anthropic | ollama | openai | google")
    model: str = Field(..., description="사용할 모델명")
    api_key: str = Field(..., description="API 키 (Ollama는 엔드포인트 URL)")
    prompt: str = Field(..., min_length=1)
    system: str | None = Field(default=None, description="시스템 프롬프트")
    max_tokens: int = Field(default=500, ge=1, le=8000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class LLMTestResponse(BaseModel):
    response: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int


class ProviderListResponse(BaseModel):
    providers: list[str]
