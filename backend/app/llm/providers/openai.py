from typing import AsyncIterator

from app.llm.base import LLMProvider, LLMResponse

DEFAULT_MODEL = "gpt-4o-mini"


class OpenAIProvider(LLMProvider):
    """OpenAI GPT 프로바이더 — M2에서 구현 예정."""

    provider_name = "openai"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL) -> None:
        super().__init__(api_key, model)

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> LLMResponse:
        raise NotImplementedError("OpenAI provider will be implemented in M2")

    async def stream(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        raise NotImplementedError("OpenAI provider will be implemented in M2")
        yield  # AsyncIterator 타입 맞추기 위한 dummy
