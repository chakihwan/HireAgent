# ADR-001: 글자수 검증은 LLM 미사용

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련 요구사항**: F-4.6 (글자수 검증)

---

## 컨텍스트

자소서 생성 시 사용자가 지정한 글자수(예: 500자)를 정확히 맞춰야 한다.
LLM에게 직접 글자수를 맞추라고 지시하는 방법과, 외부에서 검증하는 방법 두 가지 옵션이 있다.

### 문제점: LLM은 글자수를 정확히 못 셈

- LLM은 **토큰 단위**로 동작 (문자 단위 X)
- 한국어는 1글자 ≠ 1토큰 (보통 1글자 = 2~3토큰)
- "500자로 작성해줘"라고 해도 600자/400자가 나오기 일쑤
- 한국어는 영어보다 더 부정확 (영어 strawberry 문제가 한국어에서 더 심각)
- LLM 내부적으로 정답을 알아도 출력 단계에서 억제되는 현상 보고됨 (arxiv:2604.00778)

---

## 결정

**글자수 카운팅과 검증은 Python `len()` 사용. LLM에게 글자수 검증을 시키지 않는다.**

### 구체적 구현

```python
# backend/app/utils/char_counter.py
def count_chars(text: str, include_space: bool = True) -> int:
    if not include_space:
        text = text.replace(" ", "").replace("\n", "").replace("\r", "")
    return len(text)

def validate_chars(text: str, target: int, tolerance: float = 0.05) -> str:
    actual = count_chars(text)
    min_c = int(target * (1 - tolerance))
    max_c = int(target * (1 + tolerance))
    
    if actual < min_c:
        return "expand"
    elif actual > max_c:
        return "compress"
    else:
        return "ok"
```

### 파이프라인 통합

```
[작성 에이전트 (LLM)] → 자유롭게 작성
        ↓
[글자수 검증 (Python)] → 정확한 카운팅
        ↓
   미달/초과 시
        ↓
[압축/확장 에이전트 (LLM)] → "약 OO자 줄여/늘려야 함" 명령
        ↓
[재검증 (Python)] (최대 3회 시도)
```

### LLM에게는 행동 지시만

```python
# ❌ 안 좋은 프롬프트
"이 글을 500자로 줄여줘"

# ✅ 좋은 프롬프트
"""
이 글은 현재 720자입니다. 약 220자 분량을 줄여야 합니다.
다음 순서로 작업해주세요:
1. 중복되는 표현 찾아서 제거
2. 수식어/부사 줄이기
3. 짧은 문장으로 압축
4. 핵심 메시지는 유지

원본:
{text}
"""
```

---

## 대안 (검토 후 기각)

### 대안 1: LLM에게 글자수 맞추라고 지시
- ❌ 기각: 한국어 정확도 60~70%, 사용자 신뢰 깨짐

### 대안 2: LLM에게 카운팅하라고 한 후 검증
- ❌ 기각: 두 번 호출로 비용 2배, 여전히 부정확

### 대안 3: 토큰 수로 환산 (한국어 1글자 ≈ 2.5토큰)
- ❌ 기각: 어림값이라 ±5% 보장 불가

---

## 결과 (Consequences)

### 긍정적
- ✅ 100% 정확한 글자수 보장 (Python `len()`)
- ✅ 사용자 신뢰 확보 (글자수 항상 정확)
- ✅ LLM 비용 최적화 (재시도가 필요한 경우만 추가 호출)

### 부정적
- ⚠️ 최대 3회 재시도로 응답 시간 증가 가능
- ⚠️ 압축/확장 에이전트가 의미를 손상시킬 수 있음 (자가 평가로 완화)

### 중립적
- 공백 포함/제외 옵션을 사용자가 선택해야 함 (사이트마다 다름)

---

## 참고 자료

- [LLM Counting Problem (Substack)](https://substack.com/home/post/p-158624262)
- [The Genius Paradox (arxiv)](https://arxiv.org/pdf/2410.14166)
- [From Early Encoding to Late Suppression (arxiv)](https://arxiv.org/pdf/2604.00778)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | M1 시작 시 결정 |
