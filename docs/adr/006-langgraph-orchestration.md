# ADR-006: LangGraph 멀티에이전트 오케스트레이션 채택

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련 요구사항**: F-4.1~F-4.7 (멀티에이전트 생성)

---

## 컨텍스트

자소서 생성 파이프라인은 여러 에이전트(JD 분석 → RAG 검색 → 작성 → 평가 → 재작성)가
순서/병렬로 실행되어야 한다. 이를 오케스트레이션할 프레임워크 선택이 필요했다.

---

## 결정

**LangGraph를 멀티에이전트 오케스트레이션 프레임워크로 채택한다.**

```python
from langgraph.graph import StateGraph
from typing import Annotated
from operator import add

class EssayState(TypedDict):
    job_description: str
    items: list[EssayItem]
    drafts: Annotated[list[Draft], add]  # 병렬 노드 동시 추가 가능

graph = StateGraph(EssayState)
graph.add_node("jd_analyzer", jd_analyzer_node)
graph.add_node("essay_writer", essay_writer_node)  # 항목별 병렬
graph.add_node("evaluator", evaluator_node)
```

---

## 이유

| 비교 항목 | LangGraph | CrewAI | 직접 구현 |
|---------|---------|--------|---------|
| 병렬 처리 | ✅ 내장 | 제한적 | 수동 구현 |
| 상태 관리 | ✅ TypedDict | 내부 관리 | 수동 구현 |
| 순환 그래프 | ✅ 지원 | 제한 | 수동 구현 |
| 스트리밍 | ✅ 내장 | 제한적 | 수동 구현 |
| 기존 경험 | ✅ 회사 프로젝트 | 없음 | - |

가장 중요한 이유: **기존 회사 프로젝트에서 LangGraph 멀티에이전트를 구현한 경험이 있음**.
`InvalidUpdateError` 등 병렬 상태 충돌 문제도 이미 해결해봤다.

---

## 핵심 패턴 (기존 경험 기반)

병렬 노드에서 State 충돌 방지:
```python
# ❌ 병렬 노드가 같은 키를 덮어씌워 InvalidUpdateError 발생
class BadState(TypedDict):
    drafts: list[Draft]

# ✅ Annotated + operator.add 로 병렬 추가 가능
class GoodState(TypedDict):
    drafts: Annotated[list[Draft], add]
    char_counts: Annotated[dict, lambda a, b: {**a, **b}]
```

---

## 대안 (검토 후 기각)

### 대안 1: CrewAI
- ❌ 기각: 경험 없음, 병렬 처리 제한, 상태 관리 불투명

### 대안 2: 직접 asyncio 구현
- ❌ 기각: 상태 관리, 에러 처리, 스트리밍을 모두 직접 구현해야 함

### 대안 3: Celery 분산 처리
- ❌ 기각: 오버엔지니어링, 인프라 복잡도 증가

---

## 결과

### 긍정적
- ✅ 학습 비용 0 (기존 회사 경험)
- ✅ 병렬 항목 처리로 응답 시간 단축
- ✅ 순환 그래프로 재작성 루프(최대 3회) 구현 가능
- ✅ 실시간 스트리밍으로 UI 진행 상황 표시 가능

### 부정적
- ⚠️ LangGraph 버전 업 시 API 변경 가능 (활발히 개발 중)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | M1 시작 시 결정 |
