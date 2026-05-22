# ADR-008: 멀티 LLM 프로바이더 지원

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련 요구사항**: F-5.1~F-5.6

---

## 컨텍스트

LLM을 사용하는 AI 서비스는 보통 특정 프로바이더(예: Claude만)에 고정된다.
HireAgent는 Claude, GPT, Gemini, Ollama(로컬) 등 여러 LLM을 지원할지 결정이 필요했다.

---

## 결정

**Claude, OpenAI, Google Gemini, Ollama 4개 프로바이더를 지원한다.**
**에이전트별로 다른 모델을 선택할 수 있게 한다.**

```python
# 에이전트별 모델 선택 예시
agent_assignments = {
    "essay_writer":  {"provider": "anthropic", "model": "claude-opus-4-7"},   # 고품질
    "evaluator":     {"provider": "anthropic", "model": "claude-haiku-4-5"},   # 경량
    "compressor":    {"provider": "ollama",    "model": "exaone3.5:7.8b"},      # 무료
    "jd_analyzer":   {"provider": "openai",    "model": "gpt-5-mini"},          # 선택
}
```

---

## 이유

| 이유 | 설명 |
|------|------|
| 비용 컨트롤 | 작성은 고성능 모델, 평가/압축은 경량 모델로 비용 절감 |
| 로컬 LLM | Ollama로 API 비용 없이 압축/평가 처리 가능 |
| 프로바이더 락인 방지 | 특정 회사 정책/가격 변경에 의존하지 않음 |
| 포트폴리오 차별화 | Dify 벤치마킹, 멀티 프로바이더 추상화 구현 역량 증명 |
| 사용자 선택권 | 각자 보유한 API 키로 사용 가능 |

---

## 구현 패턴

레지스트리 패턴으로 새 프로바이더 추가 시 코드 변경 최소화:

```python
# factory.py
_REGISTRY: dict[str, type[LLMProvider]] = {
    "anthropic": AnthropicProvider,
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,   # 새 프로바이더 추가 시 여기만
    "google": GoogleProvider,
}
```

---

## 대안 (검토 후 기각)

### 대안 1: Claude 단일 프로바이더
- ❌ 기각: 프로바이더 락인, 비용 컨트롤 불가, 로컬 LLM 활용 불가

### 대안 2: LangChain ChatModel 추상화 사용
- ❌ 기각: LangChain 의존성 추가, 추상화 레이어 과도, 직접 구현이 더 명확

---

## 결과

### 긍정적
- ✅ 에이전트별 최적 모델 선택으로 비용/품질 균형
- ✅ Ollama로 무료 로컬 처리
- ✅ 프로바이더 의존성 없음

### 부정적
- ⚠️ 구현 복잡도 증가 (4개 클라이언트 관리)
- ⚠️ OpenAI/Google 프로바이더는 M2에서 완전 구현 예정 (M1에서는 스텁)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 (v0.2 신규) | 단일 프로바이더에서 멀티로 확장 |
