# Changelog

이 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)
버전 관리: [Semantic Versioning](https://semver.org/lang/ko/)

---

## [Unreleased]

---

## [0.7.1] - 2026-05-26

### 수정 (M5: 에세이 출력 품질 개선)

#### 핵심 버그 수정 — LLM 마크다운 오염 + 출처 레이블 누출

**근본 원인 분석**
- `essay_writer_node`가 `_clean_output()`으로 볼드/불릿 제거 → 글자수 감소 → `validate_chars` threshold 초과 → `compressor_node` 실행
- `compressor_node`는 `result.content.strip()`만 적용하여 볼드/불릿이 재도입됨
- RAG context 주입 시 `[참고 경험 1]`, `[참고 경험 2]` 번호 레이블 포함 → LLM이 그대로 복사

**수정 사항**
- `backend/app/utils/text_cleaner.py` — 신규: 공통 클린업 유틸 (`clean_llm_output`)
  - 볼드(`**text**` → `text`), 이탤릭(`*text*` → `text`), 불릿 마커(`- `, `* `) 제거
  - RAG 출처 레이블(`[참고 경험 N]`, `[경험 자료]`, `**[참고 경험 N]**`) 제거
  - 마크다운 헤더(`###`), 코드펜스(` ``` `), 글자수 메타(`**400자**`) 제거
  - compressor가 출력하는 `수정 후 글자 수: N자` 패턴 줄 단위 제거
- `backend/app/agents/essay_writer.py`
  - `_clean_output()` → `clean_llm_output()` (공통 유틸로 교체)
  - RAG context 포맷 변경: `[참고 경험 N]` 번호 레이블 제거 → `---` 구분자만 사용
  - 섹션명 `[참고 경험]` → `[경험 자료]` (LLM 혼선 감소)
  - 시스템 프롬프트 강화: "경험 자료에 없는 수치/회사명/기술명 절대 금지", "마크다운 금지" 명시
- `backend/app/agents/compressor.py`
  - `result.content.strip()` → `clean_llm_output(result.content)` 적용
  - 시스템 프롬프트 강화: 마크다운 금지, 글자수 메타 출력 금지 명시

#### RAG 인용 E2E 검증 (2026-05-26)
- 고유 수치 포함 mock README (InventorySync Pro) 인덱싱
- 공고 생성 결과: 47% / 4.2배 / 320ms→83ms 정확히 인용 ✅
- `[참고 경험 N]` 출처 레이블 본문 미노출 ✅
- 볼드/불릿 마크다운 미노출 ✅ (essay_writer + compressor 모두)
- 할루시네이션 없이 인덱싱된 데이터만 활용 ✅

---

## [0.7.0] - 2026-05-25

### 추가 (RAG 데이터 입력 확장 — GitHub repo + 파일 업로드)

#### GitHub 공개 레포 인덱싱 (ADR-019)
- `backend/app/rag/loaders/github.py` — httpx + 무인증 GitHub REST API
  - `parse_repo_url()`: `https://github.com/owner/repo[.git][/tree/main]` 패턴 파싱
  - `fetch_repo_docs()`: README (default branch 자동 탐색) + `docs/`, `doc/` 재귀 *.md/*.mdx/*.markdown
  - `_MAX_FILES = 50` 제한, 404/403(rate limit) 케이스별 명확한 에러
  - 인증 없이 60 req/h, 개인 사용에 충분
- `POST /api/v1/projects/index-github` 엔드포인트
  - 자동 `source_type` 설정 (README* → project_readme, docs/* → project_doc)
  - `project_name`은 `owner/repo` 형식으로 통일

#### 파일 업로드 (ADR-020)
- `backend/app/rag/loaders/file.py` — PDF / DOCX / MD / TXT 텍스트 추출
  - PDF: `pypdf` (이미지 PDF 실패 시 명확한 안내)
  - DOCX: `python-docx` (paragraphs + table cells)
  - MD/TXT: UTF-8 / UTF-8-sig / CP949 / EUC-KR fallback
  - 20MB 제한, 암호화 PDF 거부
- `POST /api/v1/projects/index-file` (multipart/form-data)
  - 파일 + 메타데이터 (source_type, project_name, category, company, role, tech_stack)

#### 프론트엔드 `/projects` 페이지 리팩토링
- 데이터 추가 폼을 3개 모드 탭으로 분리: **텍스트** / **GitHub Repo** / **파일 업로드**
- 모드별 입력 필드 동적 표시 (메타데이터 공통, 본문만 모드별 차이)
- 파일 input: PDF/DOCX/MD/TXT accept, 선택 파일명 + 크기 표시
- 인덱싱 성공 시 emerald 메시지, 실패 시 red 메시지

#### 의존성 추가
- `pypdf>=5.0.0`, `python-docx>=1.1.0`

#### 문서
- `docs/adr/019-github-repo-indexing.md` — GitHub 무인증 API + 마크다운 한정 + 50파일 제한 근거
- `docs/adr/020-file-upload-resume.md` — pypdf/python-docx 채택 + OCR 미지원 사유
- `docs/README.md` ADR 인덱스 019, 020 추가

### 검증
- E2E GitHub: `anthropics/anthropic-quickstarts` repo → README 1파일 → 12개 청크
- E2E 파일: 마크다운 이력서 → 1개 청크
- 프론트 빌드: 6개 페이지 모두 정상

---

## [0.6.0] - 2026-05-24

### 추가 (M4-2: RAG 파이프라인 + URL 페칭)

#### RAG 인프라
- `backend/app/rag/embeddings.py` — KURE-v1 (한국어 SOTA 임베딩, 1024-dim) lazy load
  - `asyncio.to_thread`로 동기 `model.encode` 호출 시 이벤트 루프 블로킹 회피
  - `threading.Lock`으로 동시 첫 호출 시 중복 로드 방지
- `backend/app/rag/loaders/text.py` — `RecursiveCharacterTextSplitter` (한국어 separators)
  - chunk_size=500, overlap=50, 우선순위: `\n\n` > `\n` > `。` > `.` 등
- `backend/app/rag/indexer.py` — 청킹 → 임베딩 → `career_documents` INSERT
- `backend/app/rag/retriever.py` — pgvector `cosine_distance` 검색 + user_id 필터 (CLAUDE.md Rule #4)

#### RAG REST API (`/api/v1/projects`)
- `POST /index` — 텍스트 + 메타데이터(source_type/project_name/category/tech_stack) 인덱싱
- `GET /` — 인덱싱된 청크 목록 (source_type/project_name 필터)
- `DELETE /{doc_id}` — 단일 청크 삭제
- `DELETE /by-project/{project_name}` — 같은 프로젝트 모든 청크 삭제
- `POST /search` — RAG 검색 (디버깅/검증용, distance 포함 응답)

#### LangGraph RAG 통합
- `backend/app/agents/state.py` `ItemState`에 `rag_context: list[str]` 필드 추가
- `backend/app/agents/rag_retriever.py` — 신규 노드
  - 쿼리: `"{category} 관련 경험. {jd_analysis[:300]}"`
  - 코사인 거리 0.8 이하만 채택, 최대 5개
  - 검색 실패 시 빈 리스트 반환해 자소서 생성 계속
- `backend/app/agents/orchestrator.py` — 서브그래프: `retrieve → write → ... → evaluate`
  - progress에 `[RAG N개 참고]` 표시
- `backend/app/agents/essay_writer.py` — 프롬프트에 `[참고 경험]` 섹션 동적 삽입
  - 시스템 프롬프트: "참고 경험을 자연스럽게 녹여낼 것, 출처 메타 노출 금지, 마크다운/메타 출력 금지"
  - `_clean_output()`: 마크다운 헤더(`###`), 글자수 메타(`**400자**`), 코드펜스 후처리 제거

#### URL 페칭 (ADR-018, ADR-009 보조 옵션 구현)
- `backend/app/services/url_fetcher.py` — httpx + BeautifulSoup
  - 정직한 User-Agent, 10초 timeout, 5MB 응답 제한
  - script/style/nav/header/footer 제거, main/article 우선 추출
  - 403/401/HTML 아님/본문 < 100자 케이스별 사용자 친화 에러
- `backend/app/api/v1/jobs.py` `POST /fetch-url` 엔드포인트
- 프론트 `/generate` 페이지 — URL 패턴 감지 시 경고 박스 대신 "URL에서 가져오기" 액션 버튼
  - 성공 시 textarea를 추출 텍스트로 교체, 실패 시 amber 에러 박스로 안내

#### 프론트엔드 `/projects` 페이지
- 데이터 추가 폼: source_type select + project_name/category/tech_stack + 본문 textarea
- 검색 테스트: 쿼리 입력 → 유사도 + 본문 미리보기
- 청크 목록 (프로젝트별 그룹핑): 메타데이터 표시 + 단일/전체 삭제
- 네비게이션 헤더에 "내 데이터" 링크 추가

#### 의존성 추가 (`backend/pyproject.toml`)
- `langchain-text-splitters>=0.3.0`
- `beautifulsoup4>=4.12.0` + `lxml>=5.0.0`

#### 문서
- `docs/adr/017-kure-v1-embedding.md` — KURE-v1 임베딩 채택 ADR
- `docs/adr/018-url-fetch-secondary-input.md` — URL 페칭 보조 입력 정책
- `docs/architecture.md` §3.3-3.5: RAG 인덱싱/검색 통합/URL 페칭 흐름 추가
- `docs/README.md` ADR 인덱스 017, 018 추가, 상태 배지 M4 완료
- `CLAUDE.md` ADR 요약 표 017, 018 추가, 단계 M5로 업데이트

### 검증
- E2E: KURE-v1 첫 로드 후 인덱싱 1건 (LangGraph 멀티에이전트 경험) → 자소서 생성
  - 인덱싱한 경험 키워드("5개 에이전트", "Send API", "reducer 패턴", "Python+FastAPI+PostgreSQL+pgvector")가 모두 자연스럽게 반영
  - progress: `[RAG 1개 참고]`, 평가 8.0점, 글자수 ±5% 이내

---

## [0.5.0] - 2026-05-24

### 추가 (M4-1: 자소서 라이브러리 + 지원 관리)

#### 백엔드 API
- `backend/app/schemas/jobs.py` + `services/jobs.py` + `api/v1/jobs.py`
  - `POST/GET/PATCH/DELETE /api/v1/jobs` — JobApplication CRUD
  - Status 머신 검증 (draft/submitted/passed_doc/passed_interview/passed_final/rejected/withdrawn)
- `backend/app/schemas/library.py` + `services/library.py` + `api/v1/library.py`
  - `POST/GET/PATCH/DELETE /api/v1/library` — EssayLibraryItem CRUD
  - 같은 application_id + category 재저장 시 version 자동 증가
- `backend/app/api/v1/essays.py` `?save=true` 쿼리파라미터
  - done 이벤트 직전에 라이브러리에 자동 저장, response에 `saved_ids` 포함

#### 프론트엔드
- `/library` 페이지 — 저장된 자소서 목록
  - 카테고리/최종 여부 필터, 최종 토글, 복사, 삭제, 확장/접기
  - 평가 점수 + 글자수 색상 코딩
- `/jobs` 페이지 — 지원 관리
  - 등록 폼 (회사/포지션/공고 URL/공고 내용)
  - 상태 변경 select (합격 태깅)
  - "자소서" 버튼으로 `/library?application_id=N`로 이동
- `/generate` 결과 화면 — 항목별 "저장" 버튼 (`saveToLibrary` API 호출)
- 네비게이션 헤더에 "라이브러리"/"지원 관리" 링크 추가

### 추가 (ERD 문서)
- `docs/erd.md` — Mermaid `erDiagram` (4개 테이블 + 관계 + 인덱스 + 상태 머신)
- `docs/architecture.md` §3.2에 ERD 링크 + 요약
- `docs/README.md` 문서 인덱스에 ERD 추가

### 수정 (URL 입력 경고 - 0.6.0에서 페칭으로 대체됨)
- `frontend/src/app/generate/page.tsx` — URL 패턴 감지 시 amber 경고 박스
- `backend/app/agents/jd_analyzer.py` — URL만 들어온 경우 progress에 경고 메시지

---

## [0.4.1] - 2026-05-24

### 수정
- `backend/app/api/v1/essays.py` `/generate` 엔드포인트의 그래프 중복 실행 버그
  - 기존: `astream` + 별도 `ainvoke` → 그래프가 2회 실행, 결과가 비결정적이라 SSE progress와 최종 done이 불일치
  - 수정: `astream` 한 번만 호출하면서 reducer로 누적된 `drafts`를 메모리에 모아 done 이벤트로 전송

### 추가 (문서 검토 결과 반영)
- `docs/adr/015-langgraph-send-item-subgraph.md` — LangGraph `Send` API + 항목 서브그래프 패턴
- `docs/adr/016-sqlalchemy-async-asyncpg.md` — SQLAlchemy async + asyncpg (Alembic sync 병행)
- `docs/architecture.md` §2 "M2 구현 매핑" 추가 (파이프라인 단계 ↔ 실제 파일 매핑 표)
- `docs/README.md` 상태 배지 M1 → M2, ADR 인덱스 015~016 추가
- `CLAUDE.md` ADR 요약 테이블 015~016 추가, 프로젝트 구조에서 미작성 문서 참조 제거
- `docs/requirements.md` §11.2 문서 체크리스트 현재 상태 반영
  - `agents.md`는 `architecture.md §2` + ADR-015로 대체

---

## [0.4.0] - 2026-05-24

### 추가 (M2: DB 레이어 + LangGraph 코어 에이전트 + Essay API)

#### DB 레이어
- `backend/app/db.py` — SQLAlchemy 2.0 async engine + session (asyncpg 드라이버)
- `backend/app/models/career_document.py` — RAG용 문서 모델 (pgvector 1024차원 임베딩)
- `backend/app/models/job_application.py` — 지원 단위 모델 (ADR-013)
- `backend/app/models/essay_library.py` — 자소서 항목 모델 (application_id FK)
- `backend/app/models/user_llm_config.py` — API 키 + 에이전트 할당 설정
- `backend/alembic/` — Alembic 초기화, `alembic upgrade head` 한 번에 전체 스키마 생성
  - pgvector extension 자동 활성화 (`CREATE EXTENSION IF NOT EXISTS vector`)
- `backend/pyproject.toml` — asyncpg 의존성 추가

#### LangGraph 에이전트 파이프라인
- `backend/app/agents/state.py` — `EssayState`, `ItemState`, `EssayItem`, `Draft` TypedDict
  - 병렬 노드용 `Annotated[list, operator.add]` reducer 패턴 (CLAUDE.md §멀티에이전트)
- `backend/app/agents/jd_analyzer.py` — 공고 분석 (인재상/요구역량/직무요약 추출)
- `backend/app/agents/essay_writer.py` — 항목별 초안 작성 (글자수 목표 준수)
- `backend/app/agents/compressor.py` — 글자수 초과/미달 시 압축/확장
- `backend/app/agents/evaluator.py` — JSON 품질 평가 (1-10점 + 개선 제안)
- `backend/app/agents/orchestrator.py` — LangGraph 그래프
  - JD 분석 → `Send` API로 항목별 병렬 처리 → 글자수 검증 루프(최대 3회) → 평가
  - `essay_graph.ainvoke()` / `essay_graph.astream()` 모두 지원

#### Essay 생성 API
- `backend/app/schemas/essay.py` — `EssayGenerateRequest`, `DraftResult`, `EssayGenerateResponse`
- `backend/app/api/v1/essays.py`
  - `POST /api/v1/essays/generate` — SSE 스트리밍 (진행단계 실시간 전달, ADR-012)
  - `POST /api/v1/essays/generate/sync` — 동기 응답 (테스트/디버깅용)

### M2 완료 기준 달성
- `alembic upgrade head` → 테이블 4개 + pgvector extension 생성 ✅
- `POST /api/v1/essays/generate/sync` + Ollama exaone3.5:7.8b → 지원동기 307자, 평가 8점 ✅
- JD분석 → 작성 → 글자수검증 → (압축) → 평가 파이프라인 엔드투엔드 동작 ✅

---

## [0.3.1] - 2026-05-24

### 수정
- `docker-compose.yml` ollama 서비스에 NVIDIA GPU passthrough 추가
  - `deploy.resources.reservations.devices` 설정 (RTX 5060, 8GB VRAM)
  - 기존 CPU 추론 → GPU 추론으로 전환, ~82 tokens/sec 달성 (exaone3.5:7.8b 기준)

---

## [0.3.0] - 2026-05-24

### 추가 (M1 Day 5-7: Next.js + shadcn/ui + LLM 테스트 페이지)

#### 프론트엔드 초기화
- `frontend/` — Next.js 16 + TypeScript + TailwindCSS v4 + App Router + Turbopack
- `frontend/src/components/ui/` — shadcn/ui 컴포넌트: button, input, card, textarea
- `frontend/src/lib/api.ts` — 백엔드 REST 클라이언트 (`getOllamaModels`, `testLLM`)
- `frontend/src/app/page.tsx` — LLM 테스트 페이지
  - Ollama 설치 모델 자동 로드 후 버튼으로 선택
  - Anthropic 탭: API 키 입력 + 모델 선택 (haiku/sonnet/opus)
  - 프롬프트 입력 → 백엔드 `/api/v1/llm/test` 호출 → 응답 표시 (토큰 수 포함)
- `frontend/Dockerfile` — node:20-slim 기반 개발 서버
- `frontend/.dockerignore`

#### 백엔드 수정
- `backend/app/schemas/llm.py` — `api_key` optional로 변경 (`str | None`, default=None)
- `backend/app/api/v1/llm.py` — Ollama 호출 시 `api_key` 미전달이면 `settings.ollama_base_url` 자동 사용

#### docker-compose.yml
- `frontend` 서비스 활성화 (포트 3000, `NEXT_PUBLIC_API_URL=http://localhost:8080`)

### M1 완료 기준 달성
- `http://localhost:3000` → 테스트 페이지 렌더링
- Ollama 탭 → 설치 모델 목록 표시 → 프롬프트 전송 → 한국어 응답

---

## [0.2.2] - 2026-05-22

### 추가 (아키텍처 검토 반영)

#### 유틸리티 구현
- `backend/app/utils/char_counter.py` — Python `len()` 기반 한국어 글자수 검증
  - `count_chars`, `validate_chars`, `diff_chars` (ADR-001 구현)
- `backend/app/utils/crypto.py` — Fernet AES-256 암호화/복호화
  - `encrypt_api_key`, `decrypt_api_key`, `mask_key` (CLAUDE.md 규칙 #2 구현)

#### 신규 ADR
- **ADR-012**: 자소서 생성 응답은 SSE 스트리밍 방식
  - 60초+ 응답 시간 대응, Ollama pull과 동일 패턴 재사용
- **ADR-013**: JobApplication 모델로 자소서-공고-합격이력 연결
  - 같은 회사 재지원, 항목 묶음 관리, 합격 단위 분석 가능
- **ADR-014**: Phase 3 Ollama는 사용자 로컬 전용 (서버 미배포)
  - GPU 비용 회피, 브라우저 → 로컬 Ollama 직접 호출

#### 문서 수정 (검토 결과 반영)
- `docs/architecture.md` v0.1 → v0.2
  - 파이프라인 다이어그램 수정: 항목별 완전 독립 병렬 플로우로 명확화
  - Ollama 위치 다이어그램에서 분리 (외부 API ❌ → 로컬 Docker 컨테이너 ✅)
  - SSE 스트리밍 데이터 흐름 추가
  - LLM 테스트 엔드포인트 보안 경고 명시
  - Phase 3 배포 다이어그램에 로컬 Ollama 분기 추가
  - ADR 010~014 테이블 추가
- `CLAUDE.md`
  - ADR 요약 테이블에 010~014 추가
  - 데이터 모델에 `JobApplication` 추가, `EssayLibraryItem`에 `application_id` 외래키
- `docs/README.md` — ADR 인덱스 010~014 추가
- `backend/app/api/v1/llm.py` — `/api/v1/llm/test` 에 개발용 임시 엔드포인트 경고 docstring

---

## [0.2.1] - 2026-05-22

### 추가 (ADR 문서 체계 정립)
- `docs/adr/` 디렉토리에 ADR 002~011 작성 (표준 Nygard ADR 형식)
  - 002: 채용 사이트 자동 입력 미지원
  - 003: 처음부터 멀티유저 설계 강제
  - 004: pgvector 채택 (Chroma 대신)
  - 005: 한국어 특화 임베딩 (BGE-M3/KURE-v1)
  - 006: LangGraph 멀티에이전트 오케스트레이션
  - 007: 처음부터 Next.js (Jinja2 생략)
  - 008: 멀티 LLM 프로바이더 지원
  - 009: 공고 입력 텍스트 우선
  - 010: HireAgent 전용 Ollama 컨테이너 분리
  - 011: LLM Factory 레지스트리 패턴
- `docs/README.md`에 ADR 인덱스 테이블 추가

### 변경
- `docs/CLAUDE.md` → `CLAUDE.md` (루트로 이동)
  - Claude Code는 루트의 CLAUDE.md를 자동 로드함

---

## [0.2.0] - 2026-05-22

### 추가 (M1 Day 3-4: LLM Factory + Ollama 독립 컨테이너)

#### LLM Factory
- `backend/app/llm/base.py` — `LLMProvider` 추상 베이스 클래스, `LLMResponse` 데이터 클래스
- `backend/app/llm/providers/anthropic.py` — Claude (Opus/Sonnet/Haiku) 프로바이더
- `backend/app/llm/providers/ollama.py` — Ollama 로컬 LLM 프로바이더 (스트리밍 포함)
- `backend/app/llm/providers/openai.py` — OpenAI 스텁 (M2 구현 예정)
- `backend/app/llm/providers/google.py` — Google Gemini 스텁 (M2 구현 예정)
- `backend/app/llm/factory.py` — 레지스트리 패턴 팩토리 (`_REGISTRY` 딕셔너리에 등록만 하면 됨)

#### API 엔드포인트
- `POST /api/v1/llm/test` — LLM 호출 테스트 (provider/model/api_key/prompt 파라미터)
- `GET /api/v1/llm/providers` — 지원 프로바이더 목록
- `GET /api/v1/ollama/models` — 설치된 Ollama 모델 목록
- `POST /api/v1/ollama/pull` — 모델 pull (SSE 스트리밍으로 진행률 전달)
- `DELETE /api/v1/ollama/models/{name}` — 모델 삭제

#### Ollama 독립 컨테이너
- `docker-compose.yml`에 `hireagent-ollama` 서비스 추가
  - 포트: 11435 (기존 프로젝트 11434와 충돌 없음)
  - `${HOME}/.ollama` 볼륨 마운트로 기존 모델 재사용 + 영구 저장
  - 백엔드는 내부 네트워크 `http://ollama:11434`로 직접 연결
- `scripts/pull-models.sh` — 모델 pull/list/delete 편의 스크립트

#### 설치된 모델
- `exaone3.5:7.8b` — 한국어 특화, 자소서 작성 에이전트 추천
- `gemma4:e2b` — 경량 모델, 평가/압축 에이전트용
- `deepseek-r1:7b` — 추론 특화, 평가 에이전트용

### 완료 기준 달성
- `GET /api/v1/ollama/models` → 3개 모델 정상 반환
- `POST /api/v1/llm/test` (Ollama, exaone3.5:7.8b) → 한국어 응답 정상

### 아키텍처 결정
- Ollama는 HireAgent 전용 컨테이너로 완전 분리 (다른 프로젝트 컨테이너 의존 없음)
- 새 LLM 프로바이더 추가: `providers/` 파일 추가 → `factory.py` `_REGISTRY` 등록 끝

---

## [0.1.0] - 2026-05-22

### 추가 (M1 Day 1-2: Docker Compose 환경)
- `docker-compose.yml` - PostgreSQL(pgvector) + FastAPI 서비스 구성
  - postgres: `pgvector/pgvector:pg16` 이미지, 호스트 포트 5433 (기존 5432 충돌 회피)
  - backend: 8080 포트 (기존 8000/8001/8002 점유로 조정)
- `backend/Dockerfile` - python:3.11-slim 기반, hot-reload 개발 환경
- `backend/pyproject.toml` - 전체 의존성 정의 (FastAPI, LangGraph, pgvector, LLM 프로바이더 등)
- `backend/app/main.py` - FastAPI 앱 진입점, CORS 설정, `/health` 엔드포인트
- `backend/app/config.py` - pydantic-settings 기반 환경변수 관리
- `.gitignore`, `.env.example` - 프로젝트 기본 설정
- 전체 폴더 구조 생성 (`api/v1`, `agents`, `llm/providers`, `rag`, `models` 등)

### 완료 기준 달성
- `docker compose up postgres backend` → 정상 기동
- `curl http://localhost:8080/health` → `{"status": "healthy"}` 200 응답

### 트러블슈팅
- `setuptools.backends.legacy:build` → `setuptools.build_meta` 로 수정 (python:3.11-slim 호환성)
- 포트 충돌: 기존 프로젝트 컨테이너들이 5432/8000/8001/8002 점유 → 5433/8080 사용

---

## [0.0.1] - 2026-05-22

### 추가
- 프로젝트 초기 셋업
- `CLAUDE.md` - Claude Code 컨텍스트 파일
- `docs/requirements.md` v0.2 - 요구사항 명세
- `docs/M1_execution_guide.md` - M1 실행 가이드
- `docs/README.md` - 문서 인덱스
- 9개 ADR (Architecture Decision Records)

### 결정 사항
- 프로젝트명: HireAgent
- 기술 스택: FastAPI + Next.js + LangGraph + pgvector
- 멀티 LLM 프로바이더 지원 (Claude, GPT, Gemini, Ollama)
- Phase 1 UI는 Jinja2 생략하고 처음부터 Next.js
