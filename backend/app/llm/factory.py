from app.llm.base import LLMProvider
from app.llm.providers.anthropic import AnthropicProvider
from app.llm.providers.google import GoogleProvider
from app.llm.providers.ollama import OllamaProvider
from app.llm.providers.openai import OpenAIProvider

# 새 프로바이더 추가 시 이 딕셔너리에만 등록하면 됨
_REGISTRY: dict[str, type[LLMProvider]] = {
    "anthropic": AnthropicProvider,
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,
    "google": GoogleProvider,
}


class LLMFactory:
    @staticmethod
    def create(provider: str, model: str, api_key: str) -> LLMProvider:
        cls = _REGISTRY.get(provider)
        if cls is None:
            supported = ", ".join(_REGISTRY.keys())
            raise ValueError(f"Unknown provider '{provider}'. Supported: {supported}")
        return cls(api_key=api_key, model=model)

    @staticmethod
    def supported_providers() -> list[str]:
        return list(_REGISTRY.keys())
