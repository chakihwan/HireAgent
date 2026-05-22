from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMResponse:
    def __init__(self, content: str, provider: str, model: str, input_tokens: int = 0, output_tokens: int = 0):
        self.content = content
        self.provider = provider
        self.model = model
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class LLMProvider(ABC):
    """모든 LLM 프로바이더의 추상 베이스 클래스.

    새 프로바이더 추가 시: 이 클래스를 상속 → providers/ 에 파일 추가 → factory.py 에 등록.
    """

    provider_name: str = ""

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> LLMResponse:
        ...

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        ...

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model})"
