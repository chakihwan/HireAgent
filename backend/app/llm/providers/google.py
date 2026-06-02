from typing import AsyncIterator

from google import genai
from google.genai import types

from app.llm.base import LLMProvider, LLMResponse

DEFAULT_MODEL = "gemini-2.5-flash"


class GoogleProvider(LLMProvider):
    """Google Gemini 프로바이더 (google-genai SDK).

    Client가 인스턴스별로 api_key를 보유 → 멀티유저/멀티키 환경에서 전역
    상태 충돌이 없다 (CLAUDE.md Rule #4). 구 google-generativeai의 전역
    `genai.configure()` 방식은 동시 요청 시 키가 섞일 수 있어 의도적으로 피한다.
    """

    provider_name = "google"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL) -> None:
        super().__init__(api_key, model)
        self.client = genai.Client(api_key=api_key)

    def _config(
        self, system: str | None, max_tokens: int, temperature: float
    ) -> types.GenerateContentConfig:
        # gemini-2.5 계열은 내부 thinking 토큰이 max_output_tokens를 잠식한다.
        # 자소서 본문 글쓰기엔 reasoning이 불필요한데, thinking을 켜둔 채 max_tokens를
        # 타이트하게 잡으면 thinking이 토큰을 다 써버려 본문이 수십 자로 잘린다.
        # → 2.5 계열은 thinking을 끈다 (thinking_budget=0). 2.0/1.5 등 미지원 모델엔
        #   ThinkingConfig를 보내지 않는다 (지원 안 하는 필드라 400 방지).
        thinking = (
            types.ThinkingConfig(thinking_budget=0) if "2.5" in self.model else None
        )
        return types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=temperature,
            thinking_config=thinking,
        )

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> LLMResponse:
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=self._config(system, max_tokens, temperature),
        )
        usage = response.usage_metadata
        return LLMResponse(
            content=response.text or "",
            provider=self.provider_name,
            model=self.model,
            input_tokens=getattr(usage, "prompt_token_count", 0) or 0,
            output_tokens=getattr(usage, "candidates_token_count", 0) or 0,
        )

    async def stream(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        stream = await self.client.aio.models.generate_content_stream(
            model=self.model,
            contents=prompt,
            config=self._config(system, max_tokens, temperature),
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
