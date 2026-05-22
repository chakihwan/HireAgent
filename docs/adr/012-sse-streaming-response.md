# ADR-012: 자소서 생성 응답은 SSE 스트리밍 방식

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련 요구사항**: NFR 5.1 (성능), F-4 (멀티에이전트), [ADR-006](006-langgraph-orchestration.md)

---

## 컨텍스트

자소서 생성 파이프라인은 항목 1개에 30초, 3개 병렬 시 60초 이내가 목표(NFR 5.1)다.
실제로는 다음 단계가 누적된다:

| 단계 | 예상 시간 |
|------|---------|
| JD 분석 | 3~5초 |
| RAG 검색 (항목별) | 1~2초 |
| 작성 에이전트 (항목별) | 10~20초 |
| 글자수 루프 (최대 3회) | 0~30초 |
| 자가 평가 + 재작성 | 5~10초 |

총 합산하면 1분 이상 걸리는 경우가 흔하다.
이 시간 동안 사용자 응답 방식을 어떻게 할지 결정이 필요했다.

---

## 결정

**FastAPI `StreamingResponse`로 Server-Sent Events(SSE)를 사용한다.**
LangGraph 실행 중 각 단계 완료마다 이벤트를 발행해 프론트가 실시간으로 진행 상황을 표시한다.

```python
# backend/app/api/v1/essays.py (M2 예정)
@router.post("/generate")
async def generate_essay(req: EssayGenerateRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_essay_pipeline(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

async def _stream_essay_pipeline(req):
    async for event in graph.astream(initial_state):
        yield f"event: {event.type}\ndata: {json.dumps(event.payload)}\n\n"
```

이벤트 종류:
- `jd_analyzed` — 회사 인재상/키워드 도출 완료
- `rag_found` — 항목별 RAG 결과 도착 (`{item, refs[]}`)
- `draft_done` — 항목별 초안 완성 (`{item, char_count}`)
- `char_loop` — 글자수 재시도 N회차 (`{item, attempt, action: "compress"|"expand"}`)
- `evaluation_done` — 자가 평가 점수 (`{item, score, feedback}`)
- `complete` — 최종 결과 + 라이브러리 저장 ID

---

## 이유

| 비교 항목 | SSE | WebSocket | 비동기 폴링 |
|---------|-----|----------|------------|
| 단방향 진행률 전송 | ✅ 적합 | 과한 양방향 | 폴링 오버헤드 |
| 구현 복잡도 | 낮음 (FastAPI 내장) | 중간 (소켓 라이프사이클) | 중간 (job 테이블 필요) |
| 프론트 코드 | EventSource (브라우저 내장) | ws 라이브러리 | setInterval + 상태관리 |
| 재연결 | EventSource 자동 재연결 | 수동 구현 | 다음 폴링이 곧 재시도 |
| 인프라 호환 | 일반 HTTP, Vercel/Railway OK | 일부 PaaS 제한 | 일반 HTTP |
| 기존 패턴 활용 | Ollama pull 진행률에 이미 사용 중 | - | - |

Ollama pull 진행률 API에 SSE를 이미 도입했으므로 동일 패턴을 자소서 생성에 재사용한다.

---

## 대안 (검토 후 기각)

### 대안 1: REST 동기 응답
- ❌ 기각: 60초+ 응답 → 프론트/프록시 타임아웃, 사용자에게 "멈춘 것 같은" 느낌

### 대안 2: WebSocket
- ❌ 기각: 양방향 필요 없음, Vercel 등 일부 PaaS에서 제한, 구현 복잡

### 대안 3: 비동기 job 큐 + 폴링
- ❌ 기각: job 테이블/상태관리 필요, 폴링 간격마다 DB 부하, 실시간성 떨어짐
- 단, 자소서 생성 후 백그라운드 인덱싱처럼 분 단위 작업에는 미래에 도입 가능

---

## 결과

### 긍정적
- ✅ 사용자가 60초+ 기다리는 동안 "지금 RAG 검색 중", "초안 작성 중" 등 실시간 표시
- ✅ FastAPI `StreamingResponse`로 구현 단순 (LangGraph `astream` 자연스럽게 연결)
- ✅ Ollama pull과 동일한 SSE 패턴 → 코드 일관성, 프론트 EventSource 헬퍼 재사용
- ✅ Vercel + Railway 모두 일반 HTTP라 PaaS 호환성 유지

### 부정적
- ⚠️ SSE 연결 중 에러 처리 코드 필요 (event: error 따로 발행)
- ⚠️ 프론트에서 EventSource → React Query 통합 로직 작성 필요 (M3)
- ⚠️ 일부 회사 프록시는 SSE를 버퍼링 → `X-Accel-Buffering: no` 헤더 필수

---

## 구현 체크리스트 (M2 시작 시)

- [ ] `backend/app/agents/orchestrator.py`: LangGraph `astream()` 사용
- [ ] 각 노드에서 이벤트 발행 (state 변경을 SSE 이벤트로 변환)
- [ ] `backend/app/api/v1/essays.py`: `POST /generate` → `StreamingResponse`
- [ ] 에러 이벤트 핸들링 (`event: error\ndata: {detail}`)
- [ ] `frontend/src/hooks/useEssayStream.ts`: EventSource 래핑 훅
- [ ] React Query mutation과 결합

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | 아키텍처 검토 중 60초+ 응답 대응 필요성 확인 |
