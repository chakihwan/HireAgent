# HireAgent 🎯

> 한 번 정리한 커리어 데이터로, 항목별 자소서를 멀티에이전트가 토론하며 다듬어주는 AI 도구

[![Status](https://img.shields.io/badge/status-M5%20진행%20중-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## ✨ 주요 기능

- 🎨 **항목별 자소서 생성** - 자기소개/지원동기/성장과정 등 자유 조합
- 📚 **프로젝트 문서 RAG** - GitHub README까지 인덱싱해서 디테일한 자소서 작성
- 🔁 **피드백 루프 멀티에이전트** - 작성→평가→재작성 사이클
- 📏 **글자수 정확 검증** - Python 카운팅으로 ±5% 보장 (한국어도 정확)
- 💾 **자소서 라이브러리** - 합격 태깅으로 데이터 누적
- 🔌 **멀티 LLM 프로바이더** - Claude/GPT/Gemini/Ollama 본인 키로 사용
- ⚙️ **에이전트별 모델 선택** - 비용/품질 직접 컨트롤

---

## 🚀 빠른 시작

### 필요한 것
- Docker Desktop 4.37+
- Anthropic 또는 OpenAI API 키 (또는 로컬 Ollama)

### 실행
```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 파일 열어서 ENCRYPTION_KEY 생성:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. 전체 서비스 실행
docker compose up

# 3. 브라우저에서 접속
# http://localhost:3000
```

---

## 🏗️ 기술 스택

**백엔드**: FastAPI + LangGraph + PostgreSQL(pgvector) + BGE-M3
**프론트엔드**: Next.js 14 + TypeScript + TailwindCSS + shadcn/ui
**LLM**: Anthropic / OpenAI / Google / Ollama
**인프라**: Docker Compose

---

## 📖 문서

- [요구사항 명세](requirements.md)
- [시스템 아키텍처](architecture.md)
- [데이터 모델 ERD](erd.md)
- [로드맵 (마일스톤 + 남은 할 일)](ROADMAP.md) — 앞으로 할 일
- [변경 이력](CHANGELOG.md) — 완료된 작업 (단일 소스)
- [실사용 피드백](feedback.md)
- [시니어 리뷰 (2026-06-02)](review-2026-06-02.md) — 화면 + 코드 리뷰
- [테스트 시나리오](test-scenarios.md)
- [M1 실행 가이드](M1_execution_guide.md)
- [Claude Code 컨텍스트](../CLAUDE.md) — 루트에 위치, Claude Code 자동 로드

### Architecture Decision Records (ADR)

주요 기술/설계 결정과 그 근거를 기록합니다.

| ADR | 제목 | 상태 |
|-----|------|------|
| [001](adr/001-char-count-validation.md) | 글자수 검증은 Python `len()` 사용 (LLM 미사용) | 채택 |
| [002](adr/002-no-auto-job-submit.md) | 채용 사이트 자동 입력 미지원 | 채택 |
| [003](adr/003-multi-user-design-from-start.md) | 처음부터 멀티유저 설계 강제 (user_id) | 채택 |
| [004](adr/004-pgvector-over-chroma.md) | pgvector 채택 (Chroma, Pinecone 대신) | 채택 |
| [005](adr/005-korean-embeddings.md) | 한국어 특화 임베딩 모델 (BGE-M3 / KURE-v1) | 채택 |
| [006](adr/006-langgraph-orchestration.md) | LangGraph 멀티에이전트 오케스트레이션 채택 | 채택 |
| [007](adr/007-nextjs-from-start.md) | 처음부터 Next.js 채택 (Jinja2 단계 생략) | 채택 |
| [008](adr/008-multi-llm-provider.md) | 멀티 LLM 프로바이더 지원 | 채택 |
| [009](adr/009-jd-input-text-first.md) | 공고 입력은 텍스트 붙여넣기 우선 | 채택 |
| [010](adr/010-dedicated-ollama-container.md) | HireAgent 전용 Ollama 컨테이너 분리 | 채택 |
| [011](adr/011-llm-factory-registry-pattern.md) | LLM Factory 레지스트리 패턴 | 채택 |
| [012](adr/012-sse-streaming-response.md) | 자소서 생성 응답은 SSE 스트리밍 | 채택 |
| [013](adr/013-job-application-model.md) | JobApplication 모델로 자소서-공고 연결 | 채택 |
| [014](adr/014-phase3-ollama-local-only.md) | Phase 3 Ollama는 로컬 전용 (서버 미배포) | 채택 |
| [015](adr/015-langgraph-send-item-subgraph.md) | LangGraph `Send` API + 항목별 서브그래프 패턴 | 채택 |
| [016](adr/016-sqlalchemy-async-asyncpg.md) | SQLAlchemy async + asyncpg (Alembic은 psycopg2 sync) | 채택 |
| [017](adr/017-kure-v1-embedding.md) | 임베딩 모델 KURE-v1 (한국어 SOTA, sentence-transformers) | 채택 |
| [018](adr/018-url-fetch-secondary-input.md) | URL 페칭 보조 입력 (ADR-009 구체 구현) | 채택 |
| [019](adr/019-github-repo-indexing.md) | GitHub 공개 레포 자동 인덱싱 (무인증 API) | 채택 |
| [020](adr/020-file-upload-resume.md) | 이력서 파일 업로드 (PDF/DOCX/MD/TXT, OCR 미지원) | 채택 |
| [021](adr/021-tech-stack-auto-extraction.md) | tech_stack 자동 추출 (키워드 매칭, 한국어 안전 boundary) | 채택 |
| [022](adr/022-essay-output-defense-layers.md) | 자소서 출력 다층 방어 (프롬프트+화이트리스트+후처리+경고) | 채택 |
| [023](adr/023-spa-site-url-policy.md) | SPA 채용 사이트 URL 정책 (사람인 등 사전 차단 + 북마클릿) | 채택 |
| [024](adr/024-react-flow-workflow-builder.md) | 자소서 생성 UI를 React Flow 워크플로우 빌더로 전환 | 채택 |
| [025](adr/025-per-item-agent-config.md) | 항목별 독립 에이전트 설정 (항목마다 다른 LLM) | 채택 |
| [026](adr/026-evaluation-rubric-and-transparency.md) | 자가 평가 루브릭화 + 생성 과정 투명성 (draft_history) | 채택 |
| [027](adr/027-api-key-db-encryption.md) | API 키 DB 암호화 연결 (crypto.py → UserLLMConfig, Rule #2) | 채택 |

---

## 🛣️ 로드맵

- ✅ **M1** (완료, 2026-05-24): Docker 환경 + LLM Factory + Next.js 기반 + GPU Ollama
- ✅ **M2** (완료, 2026-05-24): 핵심 에이전트 (JD분석 → 작성 → 글자수검증 → 압축 → 평가) + DB 레이어 + Essay API (SSE)
- ✅ **M3** (완료, 2026-05-24): UI 핵심 페이지 (공고 입력 → 항목 선택 → SSE 스트리밍 → 결과 확인 + 설정 페이지)
- ✅ **M4** (완료, 2026-05-24): 자소서 라이브러리 + 지원 관리 + RAG 파이프라인 (KURE-v1) + URL 페칭
- 🟢 **M5** (진행 중): 본인 실사용 + 피드백 반영 + 합격 자소서 데이터 축적
- **M5** (지속): 본인 실사용 → 피드백 반영

---

## 📜 라이선스

MIT

---

## 🙏 참고

- [Dify](https://github.com/langgenius/dify) - 멀티 LLM 프로바이더 패턴 참고
- [LangGraph](https://langchain-ai.github.io/langgraph/) - 멀티에이전트 오케스트레이션
- [shadcn/ui](https://ui.shadcn.com/) - UI 컴포넌트
