# ADR-015: LangGraph `Send` API + 항목별 서브그래프 패턴

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-24
- **결정자**: 개발자
- **관련**: [ADR-006](006-langgraph-orchestration.md), [ADR-012](012-sse-streaming-response.md)

---

## 컨텍스트

자소서는 사용자가 선택한 N개 항목(자기소개, 지원동기, 직무경험 등)을 **항목별로 독립 처리**한 뒤 합쳐야 한다.
각 항목은 다음 단계를 거친다:

1. 작성 (writer)
2. 글자수 검증 (`validate_chars` Python 함수)
3. 글자수 미달/초과면 압축/확장 (compressor), 최대 3회 루프
4. 자가 평가 (evaluator)

병렬화 + 항목별 독립 루프를 LangGraph로 구현하는 방법 검토:

1. **단일 그래프에 모든 항목 노드 정적 생성** — 항목 수가 런타임에 결정되어 불가능
2. **순차 for-loop로 항목 처리** — 병렬 효과 없음, N항목 시 N배 시간
3. **단일 그래프 + 항목 인덱스 분기** — 글자수 루프가 항목별로 독립이라 분기 복잡도 폭발
4. **`Send` API + 항목별 서브그래프 컴파일** — 메인 그래프는 fan-out만, 항목 처리는 별도 그래프로 캡슐화

---

## 결정

**메인 그래프는 `Send` API로 항목별 fan-out, 항목 처리는 독립된 서브그래프로 컴파일한다.**

### 구조

```python
# 메인 그래프 (EssayState)
StateGraph(EssayState)
  ├─ node: jd_analyzer
  ├─ conditional_edges: _fan_out → [_process_item]   # Send로 N개 분기
  └─ node: _process_item (async fn → 서브그래프 실행)

# 항목 서브그래프 (ItemState)
_item_graph = StateGraph(ItemState)
  ├─ node: write
  ├─ conditional_edges: write → {compress, evaluate}    # 글자수에 따라 분기
  ├─ node: compress
  ├─ conditional_edges: compress → {compress, evaluate} # 루프 또는 탈출
  └─ node: evaluate → END
```

### `Send` 분기 함수

```python
def _fan_out(state: EssayState) -> list[Send]:
    return [
        Send("_process_item", ItemState(item=item, jd_analysis=state["jd_analysis"], ...))
        for item in state["items"]
    ]
```

### 항목 처리 함수가 reducer로 합류

```python
async def _process_item(item_state: ItemState) -> dict:
    result = await _item_graph.ainvoke(item_state)
    return {
        "drafts": [Draft(...)],         # Annotated[list, add] → fan-in
        "progress": ["✅ ... 완료"],
    }
```

`EssayState.drafts: Annotated[list[Draft], operator.add]` 가 N개 항목의 결과를 자동 머지.

---

## 이유

| 항목 | 단일 그래프 | for-loop | `Send` + 서브그래프 |
|------|-------------|---------|---------------------|
| 항목 수 동적 결정 | ❌ 정적 컴파일 | ✅ | ✅ |
| 병렬 처리 | △ (분기 폭발) | ❌ 순차 | ✅ LangGraph가 자동 병렬 |
| 글자수 루프 캡슐화 | ❌ 노드 분기 복잡 | ✅ | ✅ 서브그래프가 자체 보유 |
| State 충돌 | ⚠️ 수동 관리 | N/A | ✅ reducer가 fan-in |
| 디버깅/시각화 | 노드 수 폭증 | 추적 어려움 | 두 그래프 분리되어 명확 |

### Send API의 핵심 가치

- **항목 수가 사용자 입력에 따라 다름** (1~10개) → 정적 그래프 불가
- LangGraph 표준 fan-out 패턴, 회사 프로젝트에서도 동일하게 사용
- 메인 State의 reducer(`Annotated[list, add]`)가 fan-in 자동 처리

### 서브그래프 분리 가치

- 글자수 검증 → 압축 → 재검증 루프는 **항목별로 완전 독립**
- 메인 그래프에 인라인하면 conditional edge 분기 폭증
- 서브그래프는 별도 컴파일되어 단위 테스트 가능

---

## 구현 (M2 완료 시점)

- `backend/app/agents/orchestrator.py`:
  - `_build_item_graph()` → 항목 서브그래프 컴파일
  - `_fan_out()` → `Send` 분기
  - `_process_item()` → 서브그래프 실행 + Draft 패킹
  - `_build_main_graph()` → 메인 그래프 컴파일
- 상태 정의: `backend/app/agents/state.py`
  - `EssayState`: 메인, `drafts/progress/errors`에 reducer
  - `ItemState`: 항목 서브그래프, reducer 없음 (단일 흐름)

---

## 대안 (검토 후 기각)

### 대안 1: asyncio.gather + 일반 함수
- ❌ 기각: LangGraph의 trace/visualization/checkpoint 이점 사라짐
- ❌ State reducer 패턴을 수동 구현해야 함

### 대안 2: 메인 그래프에 항목별 노드 동적 추가
- ❌ 기각: LangGraph는 컴파일 시 그래프 구조 확정, 런타임 추가 불가

### 대안 3: 모든 항목을 단일 ItemState 리스트로 처리
- ❌ 기각: 글자수 루프가 항목별로 독립인데 리스트 전체를 한 번에 처리하면 한 항목이 막히면 전체 지연

---

## 결과

### 긍정적
- ✅ 항목별 병렬 처리로 N항목도 ~1항목 시간에 처리
- ✅ 글자수 루프 캡슐화로 메인 그래프 단순
- ✅ 서브그래프 단위 테스트 가능
- ✅ SSE 스트리밍(ADR-012)과 자연스럽게 결합 — 노드 단위 update 이벤트

### 부정적
- ⚠️ 그래프가 2단(메인 + 서브) 구조라 처음 보면 이해 시간 필요 → architecture.md M2 매핑 표로 보완
- ⚠️ Send dispatch와 fan-in reducer를 둘 다 이해해야 함

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-24 | 최초 작성 | M2 오케스트레이터 구현 시 패턴 결정 |
