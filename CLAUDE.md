# CLAUDE.md

> 이 파일은 Claude Code가 이 프로젝트에서 작업할 때 자동으로 읽는 컨텍스트 파일입니다.
> 프로젝트의 핵심 정보, 작업 규칙, 의사결정 근거를 담고 있습니다.

---

## 🎯 프로젝트 개요

**프로젝트명**: HireAgent
**한 줄 정의**: 한 번 정리한 커리어 데이터로, 항목별 자소서를 멀티에이전트가 토론하며 다듬어주는 AI 도구
**현재 단계**: M1 (기반 구축, 1주)
**개발자**: 1인 (개인 프로젝트, 풀스택)

### 정체성
- 개인 도구 (본인 이직 시 사용)
- 포트폴리오 (멀티에이전트/RAG/풀스택 역량 증명)
- 향후 SaaS 배포 고려

---

## 🏗️ 기술 스택

### 백엔드
- **Python 3.11+** + **FastAPI** (REST API only, Jinja2 사용 안 함)
- **LangGraph** (멀티에이전트 오케스트레이션)
- **PostgreSQL + pgvector** (메타데이터 + 벡터 검색 통합)
- **BGE-M3** 또는 **KURE-v1** (한국어 임베딩)
- **Pydantic v2** (타입)
- **SQLAlchemy 2.0** + **Alembic** (ORM + 마이그레이션)

### 프론트엔드
- **Next.js 14+** (App Router)
- **TypeScript** (필수, 절대 JS로 작성 금지)
- **TailwindCSS** + **shadcn/ui**
- **React Query** (서버 상태) + **Zustand** (클라이언트 상태)
- **React Hook Form** + **Zod** (폼 검증)

### LLM 프로바이더 (멀티 지원)
- Anthropic (Claude Opus/Sonnet/Haiku)
- OpenAI (GPT-5, GPT-5 mini)
- Google (Gemini)
- Ollama (로컬 LLM)
- 추상화: `app/llm/factory.py`

### 인프라
- **Docker Compose** (개발 환경 표준)
- 배포: Railway/Fly.io (백엔드) + Vercel (프론트) - Phase 3에서

---

## 📁 프로젝트 구조

```
hireagent/
├── docker-compose.yml         # 전체 서비스 오케스트레이션
├── .env.example
├── CLAUDE.md                  # 이 파일
├── README.md
│
├── docs/                      # 살아있는 문서 (계속 업데이트)
│   ├── requirements.md        # 요구사항 명세 (v0.2)
│   ├── M1_execution_guide.md  # M1 실행 가이드
│   ├── architecture.md
│   ├── agents.md
│   ├── api_design.md
│   ├── CHANGELOG.md           # 매일 변경사항 기록
│   └── adr/                   # 아키텍처 의사결정 기록
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic/
│   └── app/
│       ├── main.py            # FastAPI 진입점
│       ├── config.py          # 환경 설정
│       ├── api/v1/            # REST 엔드포인트
│       │   ├── essays.py
│       │   ├── jobs.py
│       │   ├── library.py
│       │   ├── projects.py
│       │   └── settings.py
│       ├── agents/            # LangGraph 에이전트
│       │   ├── orchestrator.py
│       │   ├── jd_analyzer.py
│       │   ├── essay_writer.py
│       │   ├── evaluator.py
│       │   ├── compressor.py
│       │   └── state.py
│       ├── llm/               # LLM Factory (핵심)
│       │   ├── factory.py
│       │   ├── base.py
│       │   └── providers/
│       │       ├── anthropic.py
│       │       ├── openai.py
│       │       ├── google.py
│       │       └── ollama.py
│       ├── rag/
│       │   ├── indexer.py
│       │   ├── retriever.py
│       │   ├── embeddings.py
│       │   └── loaders/
│       ├── models/            # SQLAlchemy 모델
│       ├── schemas/           # Pydantic 스키마
│       ├── services/          # 비즈니스 로직
│       └── utils/
│           ├── char_counter.py
│           └── crypto.py
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── app/               # Next.js App Router
        ├── components/
        │   ├── ui/            # shadcn/ui
        │   └── features/
        ├── lib/
        ├── hooks/
        └── types/
```

---

## 🚨 절대 지켜야 할 규칙 (CRITICAL RULES)

### 1. 글자수 검증은 LLM 미사용
**LLM에게 글자수 세라고 하지 말 것**. LLM은 토큰 단위라 한국어 글자수 부정확함.
- ✅ Python `len()` 사용 → `utils/char_counter.py`
- ❌ LLM에게 "500자로 작성해줘" 같은 명령 금지
- LLM은 **압축/확장만** 시킬 것

```python
# ✅ 올바른 패턴
def validate_chars(text: str, target: int, tolerance: float = 0.05):
    actual = len(text)
    min_c, max_c = int(target * (1-tolerance)), int(target * (1+tolerance))
    return "ok" if min_c <= actual <= max_c else ("expand" if actual < min_c else "compress")
```

### 2. API 키 보안
- 사용자 API 키는 **AES-256 (Fernet) 암호화 후 DB 저장**
- 메모리에서 사용 직후 **즉시 제거**
- 절대 로그/응답/git 커밋에 노출 금지
- 환경변수 `ENCRYPTION_KEY` 필수

### 3. 채용 사이트 크롤링 정책
- **메인 방식: 사용자 직접 텍스트 붙여넣기** (IP 밴 방지)
- URL 크롤링은 보조, 공개 페이지만, 사용자 PC에서만
- **절대 하지 말 것**: 로그인 자동화, 대량 크롤링, 서버 측 크롤링

### 4. 멀티유저 설계 강제
- 현재는 단일 사용자여도 **모든 DB 쿼리에 user_id 필터 포함**
- Phase 3 배포 시 재설계 비용 회피 목적
- RAG 검색 시에도 user_id 메타데이터 필터 필수

### 5. TypeScript 엄격 모드
- 프론트엔드는 `strict: true` 유지
- `any` 타입 사용 금지 (`unknown` 으로 대체)
- 모든 API 응답은 타입 정의 필수

### 6. 살아있는 문서 워크플로우
- 코드 변경 시 관련 문서도 동시 업데이트
- 큰 결정은 `docs/adr/`에 ADR 작성
- `docs/CHANGELOG.md`에 변경사항 기록 (매일 또는 PR 단위)

---

## 🎨 코딩 컨벤션

### Python (백엔드)
- **포매터**: `ruff format`
- **린터**: `ruff check`
- **타입**: 모든 함수에 타입 힌트 (Pydantic 모델 활용)
- **비동기**: FastAPI 엔드포인트는 기본 `async def`
- **네이밍**: 함수/변수 `snake_case`, 클래스 `PascalCase`
- **에러 처리**: HTTPException 사용, 적절한 상태 코드

```python
# ✅ 권장 패턴
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends

class EssayRequest(BaseModel):
    job_description: str
    items: list[EssayItem]

@router.post("/essays/generate")
async def generate_essay(
    req: EssayRequest,
    user: User = Depends(get_current_user),
) -> EssayResponse:
    ...
```

### TypeScript (프론트엔드)
- **포매터**: Prettier
- **린터**: ESLint
- **컴포넌트**: 함수형 + Hooks
- **네이밍**: 컴포넌트 `PascalCase`, 훅 `useCamelCase`
- **타입 정의**: `types/` 디렉토리 또는 컴포넌트와 같은 파일

```typescript
// ✅ 권장 패턴
type EssayItem = {
  category: string;
  charLimit: number;
  tone: string;
};

export function EssayForm({ onSubmit }: { onSubmit: (item: EssayItem) => void }) {
  // ...
}
```

### Git 컨벤션
- 브랜치: `feat/`, `fix/`, `docs/`, `refactor/`
- 커밋 메시지: Conventional Commits (예: `feat(llm): add ollama provider`)
- 한 커밋 = 한 가지 일

---

## 🧠 핵심 의사결정 근거 (ADR 요약)

| ID | 결정 | 근거 |
|----|------|------|
| 001 | 글자수 검증은 Python `len()` | LLM은 토큰 단위, 한국어 부정확 |
| 002 | 채용 사이트 자동 입력 미지원 | IP 밴, 보안, 유지보수 부담 |
| 003 | 처음부터 멀티유저 설계 (user_id) | Phase 3 재설계 비용 회피 |
| 004 | pgvector 채택 (Chroma X) | DB 통합 운영, 트랜잭션 일관성 |
| 005 | BGE-M3/KURE-v1 임베딩 | 한국어 자소서 도메인 |
| 006 | LangGraph 채택 | 기존 회사 프로젝트 경험 |
| 007 | 처음부터 Next.js (Jinja2 생략) | 채용 시장, AI 도구 친화, 마이그레이션 비용 |
| 008 | 멀티 LLM 프로바이더 | 사용자 비용 컨트롤, 에이전트별 최적화 |
| 009 | 공고 입력은 텍스트 우선 | IP 밴 방지 |

상세 내용: `docs/requirements.md` 섹션 10 참고

---

## 🤖 멀티에이전트 아키텍처

### 자소서 생성 파이프라인
```
[입력] 공고 + 항목 + 글자수 + 톤/페르소나 + 모델 선택
   │
   ▼
[JD 분석 에이전트] ─ 회사 인재상, 키워드, 직무 요구사항
   │
   ▼ (항목별 병렬 처리)
   │
   ├─[RAG 검색]─ 메타데이터 필터로 관련 경험 추출
   │     ▼
   ├─[작성 에이전트]─ 초안 생성
   │     ▼
   ├─[글자수 검증 (Python, 비-LLM)]
   │     ▼ (미달/초과 시)
   ├─[압축/확장 에이전트] (최대 3회 재시도)
   │     ▼
   ├─[자가 평가 에이전트]─ 품질 점수
   │     ▼
   └─[재작성 에이전트]─ 최종본
        ▼
[출력] 항목별 자소서 + 인용 근거 + 개선 제안
```

### LangGraph State 관리 주의사항
- 병렬 노드의 State 충돌 → `Annotated[list, operator.add]` 패턴 사용
- 이전 회사 프로젝트에서 `InvalidUpdateError` 해결한 패턴 그대로 적용

```python
from typing import Annotated
from operator import add

class EssayState(TypedDict):
    job_description: str
    items: list[EssayItem]
    drafts: Annotated[list[Draft], add]  # 병렬 노드가 동시에 추가 가능
    char_counts: Annotated[dict, lambda a, b: {**a, **b}]
```

---

## 📊 데이터 모델 (핵심)

### CareerDocument (RAG)
```python
class CareerDocument(Base):
    __tablename__ = "career_documents"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(index=True)  # 멀티테넌시
    content: Mapped[str]
    embedding: Mapped[list[float]] = mapped_column(Vector(1024))
    
    # 메타데이터 (검색 필터링용)
    source_type: Mapped[str]  # "resume" | "essay" | "project_readme" | ...
    project_name: Mapped[str | None]
    tech_stack: Mapped[list[str]] = mapped_column(JSONB)
    category: Mapped[str | None]
    company: Mapped[str | None]
    indexed_at: Mapped[datetime]
```

### EssayLibraryItem
```python
class EssayLibraryItem(Base):
    __tablename__ = "essay_library"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(index=True)
    category: Mapped[str]  # "자기소개", "지원동기" 등
    content: Mapped[str]
    char_count: Mapped[int]
    target_company: Mapped[str | None]
    version: Mapped[int]
    status: Mapped[str]  # "draft" | "submitted" | "passed_doc" | "passed_interview" | "passed_final" | "rejected"
    created_at: Mapped[datetime]
```

### UserLLMConfig
```python
class UserLLMConfig(Base):
    __tablename__ = "user_llm_configs"
    
    user_id: Mapped[str] = mapped_column(primary_key=True)
    encrypted_keys: Mapped[dict] = mapped_column(JSONB)  # {provider: encrypted_key}
    agent_assignments: Mapped[dict] = mapped_column(JSONB)  # {agent: {provider, model}}
```

---

## 🚀 M1 마일스톤 (현재 진행 중)

**목표**: 1주 안에 "Docker Compose로 모든 서비스 뜨고, API 키 입력해서 LLM 호출 가능, 이력서 RAG 검색 가능"

### 작업 순서
1. **Day 1-2**: Docker Compose + FastAPI 골격 + PostgreSQL+pgvector
2. **Day 3-4**: LLM Factory (Anthropic + Ollama 우선)
3. **Day 5-7**: Next.js + shadcn/ui + 테스트 페이지

### M1 완료 기준
- [ ] `docker compose up` 한 번에 모든 서비스 뜨기
- [ ] FastAPI `/health` 200 응답
- [ ] LLM Factory Anthropic + Ollama 호출 성공
- [ ] Next.js 페이지에서 API 키 입력 → Claude 호출 → 응답
- [ ] `docs/CHANGELOG.md` 매일 업데이트

상세: `docs/M1_execution_guide.md`

---

## 💡 Claude Code 작업 시 참고사항

### 작업 요청 시 우선순위
1. **이 CLAUDE.md를 먼저 확인** - 컨벤션, 절대 규칙 숙지
2. **`docs/requirements.md` 참고** - 전체 요구사항
3. **`docs/M1_execution_guide.md` 참고** - 현재 단계 작업
4. **관련 ADR 확인** - 의사결정 근거

### 코드 작성 시
- 새 LLM 프로바이더 추가 → `app/llm/providers/`에 파일 추가, `factory.py` 등록만 하면 됨 (확장성)
- 새 RAG 데이터 타입 → `app/rag/loaders/`에 파일 추가
- 새 API 엔드포인트 → `app/api/v1/`에 파일 추가 + `main.py`에 라우터 등록

### 의문나는 결정이 있다면
- 추측하지 말고 사용자에게 물어볼 것
- 특히 보안, 데이터 모델, 외부 API 관련은 확인 필수

### 사용자 (개발자) 컨텍스트
- AI 엔지니어 백그라운드, LangGraph 회사 프로젝트 경험 보유
- 풀스택 경험은 제한적 (백엔드는 익숙, 프론트엔드는 학습 중)
- 한국어 의사소통 선호 (코드 주석은 영어/한국어 혼용 OK)
- 모르는 게 있으면 직접 물어보는 스타일

### 응답 시 한국어 사용
- 코드 외 설명은 한국어로
- 기술 용어는 영어 유지 (예: "Hook을 만들 때", "Pydantic 모델로")
- 코드 주석은 한국어 가능

---

## 🔗 외부 참고 자료

- LangGraph: https://langchain-ai.github.io/langgraph/
- FastAPI: https://fastapi.tiangolo.com/
- Next.js App Router: https://nextjs.org/docs/app
- shadcn/ui: https://ui.shadcn.com/
- pgvector: https://github.com/pgvector/pgvector
- Dify (벤치마킹 참고): https://github.com/langgenius/dify

---

## 📝 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2026-05-22 | 초기 작성 (M1 시작 시점) |
