# ADR-021: tech_stack 자동 추출 (키워드 매칭)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-27
- **결정자**: 개발자
- **관련**: [ADR-017](017-kure-v1-embedding.md), [ADR-019](019-github-repo-indexing.md), [ADR-022](022-essay-output-defense-layers.md)

---

## 컨텍스트

`CareerDocument.tech_stack: list[str]`은 RAG 검색 필터 + 자소서 작성 시 화이트리스트로 활용되는 핵심 메타데이터다.

기존 흐름: 사용자가 `/projects`에서 인덱싱마다 **수동으로 직접 입력**.

문제:
1. 사용자가 매번 "Python, FastAPI, Docker, ..." 일일이 적어야 함 → **UX 매우 불편**
2. 빠뜨린 기술이 자소서 작성 시 [ADR-022] 화이트리스트에서 누락 → 본인이 다룬 기술인데도 모델이 "안 다룬 것"으로 판단해 자소서에 못 씀
3. GitHub 레포 일괄 인덱싱 시 README가 자동 수집되는데 tech_stack은 수동이라 일관성 깨짐

### 후보

| 방식 | 정확도 | 속도 | 비용 | UX |
|------|-------|------|-----|-----|
| A. 키워드 매칭 (사전 정의) | 중 | 즉시 | 0 | 자동 |
| B. LLM 추출 | 높음 | 청크당 5–10초 | LLM 호출 | 자동 |
| C. 사용자 수동 (현행) | 사용자 의지 따라 | — | 0 | 부담 큼 |

---

## 결정

**방식 A — 사전 정의 키워드 매칭. 자동 추출 + 사용자 수동 추가 병합.**

### 구현 (`app/rag/tech_extractor.py`)

```python
# 약 150개 기술 키워드를 정규식 패턴으로 사전 정의
_TECH_PATTERNS: list[tuple[str, str]] = [
    (r"\bFastAPI\b", "FastAPI"),
    (r"\bPyTorch\b", "PyTorch"),
    (r"\bKafka\b", "Kafka"),
    # ... 언어/프레임워크/DB/클라우드/AI·ML/도구
]

def extract_tech_stack(text: str) -> list[str]:
    # 매칭된 표준 표기를 등장 횟수 기준 정렬해 반환
    ...

def merge_tech_stacks(*lists: list[str]) -> list[str]:
    # 대소문자 무시 중복 제거
    ...
```

### 한국어 안전 boundary

Python `\b`는 한글도 word character로 취급해 `"PyTorch로"` 같은 한국어 조사 접합 시 매칭 실패함. ASCII 영숫자만 word로 간주하는 사용자 정의 lookahead/lookbehind로 교체:

```python
def _make_boundary(pattern: str) -> str:
    if pattern.startswith(r"\b"):
        pattern = f"(?<![a-zA-Z0-9_])" + pattern[2:]
    if pattern.endswith(r"\b"):
        pattern = pattern[:-2] + f"(?![a-zA-Z0-9_])"
    return pattern
```

→ `"PyTorch로 학습"`, `"Docker로 배포"` 모두 정상 매칭.

### 인덱싱 통합 (`app/rag/indexer.py`)

```python
auto_techs = extract_tech_stack(content)
final_tech_stack = merge_tech_stacks(tech_stack or [], auto_techs)
# 모든 청크에 동일 tech_stack 적용
```

원본 전체 텍스트에서 한 번 추출 → 같은 프로젝트의 모든 청크에 동일하게 적용.

---

## 이유

### LLM 추출(B) 대신 키워드 매칭(A)을 택한 이유

1. **속도**: 인덱싱마다 LLM 호출은 사용자 체감 지연 큼 (5–10초/청크 × 수십 청크)
2. **비용**: 외부 LLM 사용 시 누적 비용. 로컬 Ollama도 추가 호출 부담
3. **도메인 한정성**: 자소서/이력서에 등장하는 기술 키워드는 사실상 200개 미만 — 사전 정의로 충분히 커버
4. **결정론적 결과**: 같은 입력은 항상 같은 출력. LLM은 비결정론적
5. **간단한 디버깅**: 어떤 키워드가 왜 잡혔는지 즉시 확인 가능

### 한계는 수용

- "JavaScript는 안 썼고, Rust 학습 중" 같은 부정문도 그대로 매칭 → 사용자가 결과 확인 후 수정해야 함
- 매우 새로운 기술(미등록 키워드)은 자동 추출 안 됨 → 사용자가 수동 추가
- 약어 충돌 (예: "R" 언어 vs 일반 단어) → word boundary로 일부 완화하지만 완전하지 않음

이 한계들은 사용자가 `/projects` 청크 미리보기에서 결과를 확인하고 필요 시 수정하는 흐름으로 보완.

---

## 트레이드오프

| 항목 | 결정 |
|------|------|
| 키워드 리스트 유지보수 | 새 기술 나올 때마다 직접 추가 (PR로 관리) |
| 동의어/별칭 | `Postgres` → `PostgreSQL`, `K8s` → `Kubernetes` 등 정규화 매핑 |
| 등장 횟수 기반 정렬 | 자주 언급된 기술이 화이트리스트 앞쪽에 → 중요도 반영 |
| 청크별 vs 문서별 적용 | 문서별 (같은 프로젝트 모든 청크 동일) — 검색 후 화이트리스트 구성 시 일관됨 |

---

## 결과

### 긍정적
- ✅ GitHub README 인덱싱 시 ~14개 기술 자동 추출 (HireAgent README 기준)
- ✅ 사용자 입력 부담 제거. 인덱싱 → 즉시 화이트리스트 완성
- ✅ ADR-022 다층 방어의 화이트리스트 정확도 향상

### 부정적
- ⚠️ 키워드 리스트 유지보수 책임 (새 기술 누락 시 추가 필요)
- ⚠️ 부정문/조건문 인식 불가 (사용자 검증으로 보완)

### 실증
- 마이그레이션 스크립트로 기존 34개 청크 일괄 채움
- 사용자의 사람인 이력서: Python, JavaScript, Java, FastAPI, Django, Flask, PostgreSQL 등 자동 추출
- chakihwan/GeoLogistics-AI: Python, JavaScript, Go, FastAPI, Docker 등 자동 추출

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-27 | 최초 작성 (v0.7.4) | M5 실사용 피드백: tech_stack 수동 부담 + 화이트리스트 누락 |
