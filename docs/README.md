# HireAgent 🎯

> 한 번 정리한 커리어 데이터로, 항목별 자소서를 멀티에이전트가 토론하며 다듬어주는 AI 도구

[![Status](https://img.shields.io/badge/status-M1%20개발중-yellow)]()
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

- [요구사항 명세](docs/requirements.md)
- [M1 실행 가이드](docs/M1_execution_guide.md)
- [문서 인덱스](docs/README.md)
- [Claude Code 컨텍스트](CLAUDE.md)
- [변경 이력](docs/CHANGELOG.md)

---

## 🛣️ 로드맵

- **M1** (현재, ~1주): Docker 환경 + LLM Factory + Next.js 기반
- **M2** (~2주): 핵심 에이전트 (작성/평가/재작성)
- **M3** (~2주): UI 핵심 페이지
- **M4** (~2주): RAG + 라이브러리
- **M5** (지속): 본인 실사용 → 피드백 반영

---

## 📜 라이선스

MIT

---

## 🙏 참고

- [Dify](https://github.com/langgenius/dify) - 멀티 LLM 프로바이더 패턴 참고
- [LangGraph](https://langchain-ai.github.io/langgraph/) - 멀티에이전트 오케스트레이션
- [shadcn/ui](https://ui.shadcn.com/) - UI 컴포넌트
