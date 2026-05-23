# Changelog

이 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)
버전 관리: [Semantic Versioning](https://semver.org/lang/ko/)

---

## [Unreleased]

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
