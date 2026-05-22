# ADR-011: LLM Factory 레지스트리 패턴

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련**: ADR-008 (멀티 LLM 프로바이더)

---

## 컨텍스트

멀티 LLM 프로바이더(ADR-008)를 구현할 때, 새 프로바이더 추가 시 코드 변경을
최소화하고 확장성을 높이는 설계 패턴이 필요했다.

---

## 결정

**레지스트리 딕셔너리 패턴으로 LLM Factory를 구현한다.**

```python
# backend/app/llm/factory.py

_REGISTRY: dict[str, type[LLMProvider]] = {
    "anthropic": AnthropicProvider,
    "ollama":    OllamaProvider,
    "openai":    OpenAIProvider,
    "google":    GoogleProvider,
}

class LLMFactory:
    @staticmethod
    def create(provider: str, model: str, api_key: str) -> LLMProvider:
        cls = _REGISTRY.get(provider)
        if cls is None:
            raise ValueError(f"Unknown provider '{provider}'. Supported: {', '.join(_REGISTRY)}")
        return cls(api_key=api_key, model=model)
```

새 프로바이더 추가 절차:
1. `backend/app/llm/providers/<name>.py` 생성 → `LLMProvider` 상속
2. `factory.py`의 `_REGISTRY`에 한 줄 추가

---

## 이유

| 비교 항목 | 레지스트리 패턴 | if/elif 분기 | 플러그인 시스템 |
|---------|--------------|------------|--------------|
| 새 프로바이더 추가 | 2개 파일 수정 | factory.py 수정 필수 | 설정 파일만 | 
| 가독성 | 딕셔너리로 한눈에 | 길어질수록 복잡 | 간접적 |
| 타입 안전성 | `dict[str, type[LLMProvider]]` | 명시적 | 런타임 의존 |
| 복잡도 | 낮음 | 낮음 | 높음 |
| 현재 프로바이더 수 | 4개 | 4개 | 4개 |

현재 4개 프로바이더로 플러그인 시스템은 오버엔지니어링이다.
레지스트리 패턴이 단순하면서 확장성도 충분하다.

---

## 추상 베이스 클래스 설계

모든 프로바이더는 동일한 인터페이스를 구현해야 한다:

```python
# backend/app/llm/base.py
class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt, system, max_tokens, temperature) -> LLMResponse: ...

    @abstractmethod
    async def stream(self, prompt, system, max_tokens, temperature) -> AsyncIterator[str]: ...
```

`LLMResponse`는 `content`, `provider`, `model`, `input_tokens`, `output_tokens`를 포함해
토큰 사용량 추적(비용 표시, F-5.6)을 위한 기반을 마련한다.

---

## 대안 (검토 후 기각)

### 대안 1: if/elif 분기
- ❌ 기각: 프로바이더 증가 시 가독성 하락, factory.py 수정 불가피

### 대안 2: Python importlib 동적 로딩
- ❌ 기각: 타입 안전성 없음, IDE 자동완성 불가, 현재 규모에 오버엔지니어링

---

## 결과

### 긍정적
- ✅ 새 프로바이더 추가 시 `factory.py`의 `_REGISTRY` 한 줄만 추가
- ✅ `supported_providers()` 메서드로 동적 목록 노출 (`GET /api/v1/llm/providers`)
- ✅ 타입 안전: `type[LLMProvider]` 강제로 잘못된 클래스 등록 방지

### 부정적
- ⚠️ M1에서 OpenAI/Google은 `NotImplementedError` 스텁 상태 (M2에서 완성)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | M1 Day 3-4 LLM Factory 설계 시 결정 |
