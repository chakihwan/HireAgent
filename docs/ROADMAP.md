# HireAgent 로드맵

> 마일스톤(M) 단위 큰 그림 + 앞으로 할 일.
> **완료된 작업의 상세 내역은 [CHANGELOG.md](CHANGELOG.md)** 를 봅니다 (이 파일은 "지금 어디까지 왔고 뭐가 남았나"만).
>
> 규칙: 항목이 완료되면 CHANGELOG에 기록하고 이 파일에서는 제거 → 항상 "남은 일"만 보이게 유지.

---

## ✅ 완료된 마일스톤 (상세: CHANGELOG)

| 마일스톤 | 내용 | 시점 |
|---------|------|------|
| **M1** | 인프라 — Docker Compose, FastAPI, PostgreSQL(pgvector), Ollama(GPU), Next.js | 2026-05-24 |
| **M2** | 백엔드 핵심 — SQLAlchemy async, DB 모델, LangGraph 파이프라인(Send fan-out) | 2026-05-24 |
| **M3** | 기본 UI — 4단계 생성 플로우, 에이전트별 설정 | 2026-05-24 |
| **M4** | 라이브러리·지원관리·RAG(KURE-v1) — 자소서 저장/버전, URL 페칭 | 2026-05-24 |
| **M5** | 실사용 + 피드백 반영 — 출력 다층 방어, RAG 가중검색, 회사명 추출, pytest 38건 | 2026-05-26~06-01 |

> M5 후반에 UI 고도화를 시작(대시보드·워크플로우 빌더·모델 관리·VRAM 경고)했고, 본격적인 UI 작업은 **M6**으로 이어집니다.

---

## 🚧 M5 잔여 (마무리 후 M6 진입)

### 실사용 검증
- [ ] 실제 채용 공고 3~5개로 자소서 생성 (공고별 품질 비교)
- [ ] 기존 자소서가 있다면 텍스트 업로드 → `source_type=essay` 인덱싱

### 아키텍처 정합성 — 🟡 리뷰 2026-06-02 (포트폴리오)
- [완료] React Query/Zustand 도입 (선언 스택 실제 사용) — 대시보드 RQ 전환, settings Zustand
- [완료] `generate/page.tsx` 분할 — `useEssayGeneration` 훅 (774→727줄)
- [완료] React Query를 jobs/library/projects 페이지에도 확대 적용 (보일러플레이트 제거 + invalidate 자동 갱신)
- [ ] 빈 `except Exception` 로깅 추가 (url_fetcher/file.py)

### 품질
- [ ] structlog 구조화 로깅
- [ ] 헬스체크에 KURE-v1 로드 상태 추가 (현재 `/health/ready`는 DB+Ollama만)

---

## 🎨 M6 — UI 고도화 (다음 마일스톤)

### 글로벌 UX
- [ ] 다크 모드 (`next-themes` + Tailwind dark:)
- [완료] Toast 알림 통일 (`alert()` 9곳 → sonner toast, v0.7.7)
- [ ] 로딩 스켈레톤 컴포넌트 통일
- [ ] 한국어 폰트 (Pretendard/Suit — 현재 Geist는 영어 폰트)
- [ ] 모바일 반응형 점검 (워크플로우 캔버스 데스크톱 우선이라 특히 필요)
- [ ] 빈 상태 일러스트

### `/generate`
- [ ] 항목별 톤/페르소나 다르게 설정 (현재 모델만 항목별, 톤·페르소나는 공통)
- [ ] 항목 순서 드래그 (`@dnd-kit/sortable`)
- [ ] 미세 조정 버튼 ("더 도전적으로"·"수치 강조"·"더 짧게" 1-click 재생성)
- [ ] 결과에 RAG 인용 펼치기 (어떤 경험 참고했는지 토글)
- [ ] 생성 취소 버튼 (SSE 도중 abort)
- [ ] A/B 비교 모드 (같은 항목 2번 생성 → 나란히)
- [ ] 지원 연결 드롭다운 (저장 시 application_id 선택)
- [ ] JD 분석 결과 미리보기 (요구역량/인재상 추출 표시)
- [ ] VRAM 빠듯(tight) 모델 인라인 경고 (현재 over만 차단, 노드에 tight 표시 추가)

### `/library`
- [ ] 검색 (제목/내용 풀텍스트)
- [ ] 통계 헤더 (총 N · 최종 N · 합격 회사 N)
- [ ] 같은 카테고리 버전 비교 (diff 뷰)
- [ ] 합격 자소서 모아보기 (status=passed_* 조인)
- [ ] 태그 추가 (메타 자유 태그 JSONB)
- [ ] TXT/DOCX export (최종본 일괄 다운로드)

### `/jobs`
- [ ] 칸반 보드 뷰 (상태별 column, 드래그로 상태 변경)
- [ ] D-Day 배지 / 캘린더 뷰 (마감일)
- [ ] 합격률 통계 (서류/면접/최종 단계별 %)
- [ ] 진행 단계 타임라인 / 회사별 자소서 카운트

### `/projects`
- [ ] GitHub 인덱싱 진행률 (파일별 SSE/polling)
- [ ] 검색 결과 하이라이팅 / 재인덱싱 옵션 (기존 청크 삭제 후 재인덱싱)
- [ ] 메타데이터 일괄 편집 / 드래그&드롭 업로드 / 키보드 접근성

### `/models` (구 /settings 통합)
- [ ] 프리셋 적용 (성능/비용/오프라인 한 번에 — 에이전트 모델 일괄 설정)
- [ ] API 키 테스트 호출 버튼 (응답 시간/성공 표시)
- [ ] 토큰 사용량 누적 + 모델별 추정 비용

### 새 페이지 후보
- [ ] `/insights` 자소서 패턴 분석 · `/templates` 항목 조합 템플릿 · `/help` 가이드

### 미완 기능 (요구사항 §4.1)
- [ ] F-3.3 공백 제외 글자수 옵션
- [ ] F-5.6 토큰 사용량 누적 표시
- [ ] F-7.1 프로젝트 카드 자동 요약

---

## 🚀 M7 — 배포 (Phase 3)

- [ ] OAuth 인증 (Google/GitHub) + 가입/로그인 페이지
- [ ] 멀티테넌시 검증 (user_id 격리 실측)
- [ ] Railway/Fly.io 백엔드 + Vercel 프론트 배포, HTTPS + 도메인
- [ ] 백엔드 별도 임베딩 서버 분리 (또는 외부 API 전환)
- [ ] 임베딩 모델 캐시 볼륨 마운트 (재시작 시 KURE-v1 재다운로드 방지)
- [ ] **Mac(Apple Silicon) 통합 메모리 기반 VRAM 경고** — 네이티브 Ollama 전제 (feedback.md 2026-06-01)

---

## 💎 M8+ — 확장 기능 (Phase 2, 요구사항 §4.2)

- [ ] F-8.1 면접 코치 (예상 질문 + 답변 가이드)
- [ ] F-8.2 매칭 분석 (공고-이력서 임베딩 유사도)
- [ ] F-8.3 회사 분석 (외부 데이터 보강)
- [ ] F-8.4 노드 그래프 UI 확장 (사용자 편집형 — 현재는 시각화 전용, ADR-024)
- [ ] F-8.5 커리어 타임라인 / F-8.6 브라우저 확장프로그램

---

## 📚 상시 트랙 — 문서 + 포트폴리오

- [ ] 루트 `README.md` 강화 (데모 GIF, What/Why/How, 배지, ADR 링크)
- [ ] `docs/demo.md` 첫 사용 5분 가이드 (인덱싱→공고→생성, 스크린샷)
- [ ] `docs/deployment.md` Railway+Vercel 배포 가이드
- [ ] `docs/api.md` 핵심 흐름 narrative

---

## 🔧 상시 트랙 — 기술 부채

- [ ] 글자수 초과 근본 해결 — 500자 목표 → 689자 케이스 (인라인 편집은 워크어라운드 완료)
- [ ] orchestrator `_pack_draft` 제거 흔적 검증
- [ ] E501 한국어 주석/docstring 줄길이 23건 (ruff line-length가 한국어에 불리 — 설정 조정 검토)
- [ ] 에러 핸들링 일관성 (`HTTPException` vs `ValueError` vs `Exception`)
- [ ] 프론트 API 에러 메시지 한국어 통일
- [ ] URL 페칭 로그인 페이지 감지 (LinkedIn 등 로그인 벽 본문 그대로 반환)
- [ ] API 직접 호출 시 `char_target` 제약 안내 (프론트는 영향 없음)
- [ ] Alembic 마이그레이션 절차 문서화 (현재 1개)
