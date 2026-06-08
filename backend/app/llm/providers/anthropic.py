from typing import AsyncIterator

from anthropic import AsyncAnthropic

from app.llm.base import LLMProvider, LLMResponse
from app.utils.llm_retry import llm_retry

# 기본 모델: 비용 절감을 위해 haiku, 에이전트 별로 오버라이드 가능
DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class AnthropicProvider(LLMProvider):
    provider_name = "anthropic"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL) -> None:
        super().__init__(api_key, model)
        self.client = AsyncAnthropic(api_key=api_key)

    @llm_retry
    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> LLMResponse:
        kwargs: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        response = await self.client.messages.create(**kwargs)
        return LLMResponse(
            content=response.content[0].text,
            provider=self.provider_name,
            model=self.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    async def list_models(self) -> list[str]:
        page = await self.client.models.list(limit=100)
        return [m.id for m in page.data]

    async def stream(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        kwargs: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
