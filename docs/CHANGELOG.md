# Changelog

이 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)
버전 관리: [Semantic Versioning](https://semver.org/lang/ko/)

---

## [Unreleased]

### 계획 중
- LLM Factory 구현 (M1, Day 3-4)
- Next.js 초기화 + shadcn/ui (M1, Day 5-7)

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
