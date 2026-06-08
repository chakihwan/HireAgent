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

    async def list_models(self) -> list[str]:
        """이 프로바이더에서 사용 가능한 모델 ID 목록. 미지원 시 빈 리스트.

        주의: '존재하는 모델'을 반환할 뿐, 호출자의 티어/quota로 실제 사용 가능한지는
        알 수 없다 (그건 런타임 호출에서만 확정 — 무료 0 모델도 목록엔 나온다).
        """
        return []

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model})"
