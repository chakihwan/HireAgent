# Changelog

이 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)
버전 관리: [Semantic Versioning](https://semver.org/lang/ko/)

---

## [Unreleased]

### 추가 — 대시보드 홈 페이지 (UI 고도화 시작)

- `/` 리다이렉트(`→ /generate`) 제거 → 실제 대시보드 페이지로 교체
- 통계 카드 4종: 지원 / 자소서(최종 N) / 인덱싱 청크(자료 N) / 합격률
  - 클라이언트에서 `listJobs`+`listLibrary`+`listProjects` 병렬 호출로 집계 (새 백엔드 API 불필요)
  - 합격률 = passed_* / (제출 이상 결과난 지원), 결과 없으면 "—"
- 최근 활동 타임라인: 자소서 생성 + 지원 등록/상태변경 병합, 최신순 6개, 상대시간 표기
- 빠른 시작 버튼 3종 + 데이터 없을 때 온보딩 빈 상태 카드
- `layout.tsx`: 로고/네비를 `/`(홈)로 연결, "홈" 메뉴 추가
- 검증: SSR 셸 렌더 + tsc 통과 + 실데이터 집계 로직 확인 (브라우저 육안 구동은 미실시 — Playwright 부재)

### 추가 — pytest 단위 테스트 셋업

- `backend/tests/` 신규 — 결정적 유틸 함수 회귀 테스트 38건 (전부 통과)
  - `test_char_counter.py`: count/validate/diff (ADR-001 Python len 기반) 8건
  - `test_text_cleaner.py`: 마크다운·개인정보(이메일/전화/주소)·한국어헤더·서명·폭주 19건
  - `test_tech_extractor.py`: 키워드 추출·병합·한국어 인접 boundary 7건
  - `test_retriever_weights.py`: source_type 가중치 카테고리 선택 4건
- 실행: `docker compose exec backend python -m pytest tests/ -q`

### 추가 — RAG source_type 가중 검색

- `retriever.py`: `source_weights` 파라미터 + `source_weights_for_category()` 헬퍼
  - 후보 풀(limit × 4)을 받아 source_type별 가중치를 거리에 곱해 재랭킹
  - 기본 가중치: project_readme(0.80)·project_doc(0.85) 우대, resume(1.0) 중립
  - 동기 항목(지원동기/입사/포부): essay(0.75)·resume(0.90) 우대
- `rag_retriever_node`: 카테고리별 가중치 적용 + `rag_sources` (source_type 분포) 반환
- `orchestrator`: 진행 로그에 `[RAG N개 참고: project_readme 5]` 형태로 분포 노출
- **해결한 문제**: 이력서의 무관 경력(운전면허·자격증·전 직무)이 프로젝트 경험과
  동등하게 검색돼 자소서에 섞이던 문제 (feedback.md 2026-05-29 "이력서 내용 섞임")
- **검증**: 직무경험 → project_readme 5 / 지원동기 → resume 4, project_readme 1 (대비 확인)

---

## [0.7.6] - 2026-05-29

### 추가

**결과 인라인 편집 (프론트엔드)**
- `/generate` 결과 카드 Textarea `readOnly` 제거 → 직접 편집 가능
- `editedContents: Record<string, string>` 상태 추가, 카테고리별 독립 편집
- 글자수 Badge가 편집 중인 내용 기준으로 실시간 업데이트
- "편집됨" 뱃지 표시 (원본과 달라졌을 때)
- 저장·복사 시 편집된 내용 사용

**지원 회사명 JD 자동 추출 → essay_writer 주입**
- `jd_analyzer.py`: 출력 포맷에 `## 지원 회사명` 추가 + `_COMPANY_RE` 정규식 파싱
- `state.py`: `EssayState.target_company`, `ItemState.target_company` 필드 추가
- `essay_writer.py`: `[지원 회사 정보]` 섹션으로 목표 회사명 + 현직장 혼동 방지 주의 주입
- 이력서에 등장하는 현직장 회사명이 지원동기에 노출되던 문제 방지

### 수정 — 자소서 출력 품질

**개인정보 노출 방지 (Critical)**
- `text_cleaner.py`에 이메일/전화번호/주소/연락처 라벨/서명 제거 패턴 추가
  - 이력서 RAG 청크에 포함된 연락처가 자소서 본문에 유입되던 문제
  - `_EMAIL_RE`, `_PHONE_RE`, `_CONTACT_LABEL_LINE_RE`, `_ADDRESS_LINE_RE`, `_CLOSING_SIGNATURE_RE`

**한국어 섹션 헤더 제거**
- "기술 역량", "실행력과 협업", "연락처", "입사 후 계획" 등 소제목이 본문에 남던 문제
- `_KOREAN_HEADER_RE` 추가 → `clean_llm_output()`에서 자동 제거

**글자수 초과 개선**
- `essay_writer.py`: `max_tokens = char_limit × 2` (기존 × 3) — 물리적 생성량 제한
- 프롬프트에 허용 범위(min~max) 명시 + 초과 시 품질 저하 경고 강화
- 프롬프트에 "맺음말 서명·소제목 금지" 명시
- `compressor.py`: `max_tokens = target × 2` (기존 × 3), 허용 범위 명시

### 테스트 — 실사용 데이터 1차 검증 (이력서 13청크 + 레포 39청크)

발견된 이슈 및 수정:
- ✅ 개인 연락처(이메일/전화/주소) 자소서 본문 노출 → text_cleaner로 해결
- ✅ 한국어 섹션 헤더 잔존 → _KOREAN_HEADER_RE 추가
- ✅ Kafka 할루시네이션 없음 (whitelist 정상 동작)
- ⚠️ 글자수 초과 여전 (500자 목표 → 689자, 3회 압축 소진) — 프롬프트+max_tokens 강화로 부분 개선

---

## [0.7.5] - 2026-05-28

### 수정

- **라이브러리 버전 관리 버그**: `application_id=null`(자유 작성) 케이스도 같은 카테고리 재저장 시 version 증가하도록 수정 (`library.py`)
  - 기존: `application_id`가 없으면 항상 version=1
  - 수정: `user_id + category + application_id IS NULL` 조건으로 마지막 버전 조회

### 추가

- **글자수 초과/부족 SSE 경고** (`orchestrator.py`): 항목 생성 완료 후 목표 ±5% 초과 시 `⚠️ 글자수 N자 초과` 진행 로그 표시
  - iteration 3회 소진 후에도 글자수 안 맞으면 사용자에게 재생성 권유

### 테스트

- 3차 내부 자동화 테스트 완료 (시나리오 1~9 커버)
  - tech_stack 자동 추출 DB 저장 확인
  - 라이브러리 버전 증가 수정 검증
  - 원티드 실제 공고 URL 페칭 정상 확인
  - Kafka 할루시네이션: whitelist 있어도 의미 수준 할루시네이션 막기 어려움 확인 (알려진 LLM 한계)

---

## [0.7.4] - 2026-05-27

### 수정 — 자소서 압축 무한 루프 (Critical)

`compressor_node`가 `iteration` 카운터를 증가시키지 않아 `_needs_compression`이 영원히 `compress` 분기로 빠지는 버그. 한국어 약한 모델로 글자수가 안 맞을 때 1시간 넘게 무한 호출되는 사례 발생.

- `backend/app/agents/compressor.py`: `iteration: state.get("iteration", 0) + 1` 반환에 추가

### 추가 — 자소서 품질 다층 방어

**할루시네이션 방지**
- **시스템 프롬프트 강화** (`essay_writer.py`)
  - "공고 분석 ≠ 본인 경험" 명시, Kafka 예시 추가 (공고에 있어도 [경험 자료]에 없으면 사용 금지)
- **tech_stack 화이트리스트 명시 전달**
  - `ItemState.tech_whitelist` 신규 (`state.py`)
  - `rag_retriever_node`가 사용자의 전체 문서에서 tech_stack 합집합 수집
  - essay_writer 프롬프트에 "이 목록에 없는 기술은 절대 사용 금지" 명시

**출력 폭주 / 다국어 혼용 대응**
- **`detect_output_issue()` + `strip_repetition()` 신규** (`text_cleaner.py`)
  - 반복 패턴 (`8-8-8-8-...`) 자동 압축
  - 한글 비율 30% 미만 / 한자·키릴·베트남어 5% 이상 감지
  - DeepSeek-R1 `<think>` 태그, prompt label echo (`[현재 자소서]`), 영문 헤더(`Key Contributions:`) 자동 제거
- **SSE 진행 로그에 품질 경고 추가** (`orchestrator.py`)
  - 항목 완료 시 자동 검사 → 문제 시 `⚠️ 품질 경고: foreign_script (14%)` 메시지
  - 사용자가 어느 항목이 깨졌는지 즉시 인지 + 한국어 모델 권장 안내

### 추가 — tech_stack 자동 추출

수동 작성 부담 + 화이트리스트 정확도 동시 해결.

- **`backend/app/rag/tech_extractor.py` 신규**
  - 사전 정의 ~150개 기술 키워드 패턴 매칭 (언어/프레임워크/DB/클라우드/AI/ML 등)
  - 한국어 안전 boundary — `PyTorch로` 같이 한국어 조사 붙어도 정확히 매칭
- **`indexer.py`**: 본문에서 자동 추출 후 사용자 입력과 병합 (대소문자 무시 중복 제거)
- 기존 인덱싱된 데이터도 마이그레이션 스크립트로 일괄 채움

### 추가 — 사람인/잡코리아 URL 페칭 대응

**백엔드 SPA 사이트 차단** (`url_fetcher.py`)
- 도메인 화이트리스트: 사람인 / 잡코리아 / LinkedIn (확실히 안 되는 곳만)
- 노이즈 키워드 휴리스틱: "로그인/회원가입/메뉴" 등 5개 이상이면 SPA shell 판정
- `URLFetchError`에 분류 코드 (`spa_site` / `bot_blocked` / `login_required` / `timeout` / `bad_request`) 추가

**API 응답 구조화** (`jobs.py`)
- 422 응답 `detail`에 `{code, message, site_name}` dict 형태로 반환

**프론트엔드 SPA 안내 카드** (`generate/page.tsx`)
- `SpaSiteGuide` 컴포넌트 신규
- 사람인 한정 팁: `Ctrl+P` → PDF 저장 경로 우선 안내 (iframe 본문도 함께 렌더됨)
- **북마클릿 신규 제공**
  - 드래그·우클릭 두 가지 등록 방식 + 코드 복사 버튼 (React `javascript:` href sanitize 우회용 useRef)
  - 셀렉터 후보 + iframe 자동 dive
  - 사람인/잡코리아 감지 시: iframe 직접 접근 실패하면 → "iframe URL 새 탭으로 열기" 옵션 제공
  - 다른 사이트에서는 일반 추출 로직 그대로

### 추가 — Ollama 모델 관리 UI (`settings/page.tsx` 전면 재작성)

- 모델 선택을 **텍스트 입력 → 설치된 모델 드롭다운** 으로 교체
- **Ollama 모델 관리 카드** 신규
  - 설치된 모델 목록 (크기·파라미터 표시) + hover 삭제
  - **추천 모델 7개** 다운로드 버튼 (exaone3.5:7.8b/2.4b, qwen2.5:7b/3b, gemma2:9b/2b, llama3.2:3b)
  - "한국어 SOTA" 등 능력 태그 + 권장 에이전트 표시
  - SSE 진행률 바 + 다운로드 취소 버튼
- `frontend/src/lib/api.ts`: `pullOllamaModel` (SSE), `deleteOllamaModel`, `OllamaModel` 타입 수정

### 추가 — 청크 미리보기 모달 (`/projects`)

"내 데이터가 어떻게 임베딩됐는지 모르겠다"는 피드백 해결.

- 디렉토리 뷰 항목 row 클릭 → 모달로 청크 전체 내용 표시
- 각 청크: ID, 길이, 본문 텍스트, 메타데이터(source_type, tech_stack, 등록일)
- 안내: "RAG 검색 단위. 의미 단위로 잘 쪼개졌는지 확인"

### 발견된 이슈 (향후 작업)

- ⚠️ **사람인 본문 iframe**: 부모 페이지에 다른 회사 공고가 길게 들어있어 단순 longest-match는 노이즈를 가져옴. 북마클릿이 iframe 직접 접근 못 하면 사용자가 iframe URL을 새 탭으로 열고 거기서 다시 클릭해야 함 (또는 Ctrl+P 권장).
- ⚠️ **다국어 작은 모델 폭주**: qwen2.5/deepseek-r1/gemma4 등이 한국어 출력 중 한자/베트남어/키릴 섞이거나 `8-8-8` 패턴으로 폭주. `clean_llm_output`이 패턴을 압축하지만 근본 해결은 한국어 특화 모델(exaone3.5) 통일.

---

## [0.7.3] - 2026-05-26

### 개선 — `/projects` 페이지 카드형 + 디렉토리 구조 재설계

**배경**: 0.7.2의 카드형 빈 상태가 좋은 피드백을 받아, 데이터 등록 후에도 동일한 카드 UI를 유지하고 업로드된 데이터는 별도 디렉토리 뷰로 분리하기로 결정.

**변경 사항** (`frontend/src/app/projects/page.tsx` — 전체 재작성)

- **3-카드 선택 영역** (항상 표시, 고정 높이 h-28)
  - 이력서 / GitHub 레포 / 경험·자소서
  - **카드 전체가 클릭 영역** (`<button>` 태그) — 모서리 + 버튼만 클릭 안 함
  - 선택된 카드는 강조 보더 + 그림자
  - 우측 상단에 등록된 항목 수 배지 표시

- **인라인 폼 패널** (카드 아래 풀 너비)
  - 카드 클릭 시 슬라이드 다운, 같은 카드 재클릭하면 닫힘
  - 카드 종류에 따라 다른 필드 노출:
    - 이력서: 파일 + 레이블 + 기술 스택
    - GitHub: URL + 기술 스택
    - 경험·자소서: 유형(`essay`/`custom`) + 제목 + 텍스트

- **인덱싱된 데이터 디렉토리 뷰**
  - 폴더 3개 (이력서 / GitHub / 경험·자소서)로 분리, 각각 접기/펼치기 가능
  - 파일 row: 이름 + 청크 수 + 등록일, hover 시 삭제 버튼
  - 카드 영역과 데이터 영역 완전 분리 (등록 시 카드 크기 변동 없음)

### 수정 — GitHub 레포 삭제 404 버그

- `backend/app/api/v1/projects.py`
  - `{project_name}` → `{project_name:path}` 타입 변경
  - 슬래시 포함 project_name (`owner/repo` 형식)도 단일 파라미터로 매칭

### 인프라 — WSL2 + Docker HMR 활성화

**배경**: Windows 파일시스템(`/mnt/d/...`)의 inotify 이벤트가 컨테이너로 전달 안 됨 → 파일 수정마다 `docker compose restart frontend` 필요했던 문제.

- `docker-compose.yml`
  - `frontend.environment.WATCHPACK_POLLING: "true"` 추가
- `frontend/package.json`
  - `"dev": "next dev --webpack"` (Turbopack → webpack, Next.js 16 폴링 지원)
- `frontend/next.config.ts`
  - `webpack.watchOptions.poll: 1000` (1초 간격 폴링)

이제 파일 저장 시 브라우저가 자동으로 변경사항 반영됨 (재시작 불필요).

---

## [0.7.2] - 2026-05-26

### 개선 — `/projects` 페이지 UX 전면 개선

**배경**: 실사용 테스트에서 "어떻게 올려야 할지 감도 안 온다"는 피드백 → 데이터 추가 플로우 전반 재설계

**변경 사항** (`frontend/src/app/projects/page.tsx`)

- **빈 상태 → 가이드 화면으로 교체**
  - 3단계 흐름 안내: 데이터 등록 → RAG 검색 확인 → 자소서 생성 시 자동 참고
  - 퀵 액션 카드 3개: 이력서 업로드 / GitHub 레포 인덱싱 / 텍스트 직접 입력
  - 카드 클릭 시 해당 모드로 폼 열리며 source_type 자동 세팅

- **모드 전환 시 source_type 자동 연동**
  - 파일 업로드 탭 → `이력서` 자동 선택
  - GitHub Repo 탭 → `프로젝트 README` 자동 선택
  - 텍스트 직접 입력 탭 → `기타 경험` 자동 선택

- **각 탭에 설명 텍스트 추가** (어떤 용도에 적합한지 한 줄 안내)

- **source_type 드롭다운 설명 추가** (이름 옆에 용도 한 줄 표시)

- **검색 섹션 위치 변경 + 레이블 개선**
  - "검색 테스트" → "RAG 검색 확인" (실용 목적 명확화)
  - 데이터 목록 하단에 접이식(collapsible)으로 이동 (개발 도구 느낌 해소)

- **데이터 있을 때 흐름 힌트 배너 추가** (상단에 한 줄 안내)

- **버튼 레이블 개선**: "인덱싱" → "인덱싱 시작", 성공 메시지에 체크 아이콘 추가

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

#### 7개 시나리오 자동 검증 (2026-05-26)
- `docs/test-scenarios.md` 전 시나리오 API 직접 호출로 자동 실행
- 시나리오 1 (RAG 베이스라인): 504자 ±5%, 평가 8점, 마크다운/레이블 없음 ✅
- 시나리오 3 (GitHub 인덱싱): langchain-ai/langgraph 20청크 인덱싱 후 자소서 생성 정상 ✅
- 시나리오 4 (글자수): 300/800/1000자 모두 ±5% 통과, compressor 마크다운 재도입 버그 완전 해소 확인 ✅
- 시나리오 5 (3항목 병렬): 자기소개 514 / 지원동기 574 / 직무경험 688, 총 76초 ✅
- 시나리오 6 (URL 페칭): 사람인 정상, 404 한국어 안내 정상 ✅, ⚠️ LinkedIn 로그인 페이지 미감지
- 시나리오 7 (라이브러리): 저장/조회/최종/삭제 정상, 버전 증가는 `application_id` 필수 (설계대로) ✅

#### 신규 발견 이슈 (M5 체크리스트로 이관)
- GPU fallback 안전장치 부재 (다른 컨테이너 VRAM 점유 시 조용히 CPU로 전환)
- LinkedIn URL 페칭이 로그인 페이지 본문을 그대로 반환
- `chakihwan/HireAgent` 비공개 레포라 본인 레포 인덱싱 시나리오 막힘

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
