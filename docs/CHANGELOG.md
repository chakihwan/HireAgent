# Changelog

이 프로젝트의 모든 주요 변경사항을 기록합니다.

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)
버전 관리: [Semantic Versioning](https://semver.org/lang/ko/)

---

## [Unreleased]

### 계획 중
- Docker Compose 환경 구축 (M1, Day 1-2)
- LLM Factory 구현 (M1, Day 3-4)
- Next.js 초기화 + shadcn/ui (M1, Day 5-7)

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
