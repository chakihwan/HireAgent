# HireAgent 요구사항 명세서

> **버전**: v0.3
> **작성일**: 2026-05-22 (v0.3 업데이트: 2026-05-24)
> **상태**: 🟢 M1-M4 완료, M5 진행 중
> **이전 버전**: v0.2 (HireAgent 명명, 멀티 LLM)

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v0.1 | 2026-05-22 | 초안 작성 (CareerOS 가칭) |
| v0.2 | 2026-05-22 | 프로젝트명 확정(HireAgent), 기술스택 조정, 멀티 LLM 프로바이더 추가, UI 전략 변경 |
| v0.3 | 2026-05-24 | M1-M4 완료 반영 (마일스톤 체크리스트, ADR 010-018 요약, 문서 인덱스 정리) |

---

## 1. 프로젝트 개요

### 1.1 프로젝트명
**HireAgent**
- Hire(채용) + Agent(AI 에이전트)
- 채용 시장을 위한 멀티 AI 에이전트 시스템

### 1.2 한 줄 정의
**"한 번 정리한 커리어 데이터로, 항목별 자소서를 멀티에이전트가 토론하며 다듬어주는 AI 도구"**

### 1.3 정체성
- **개인 도구**: 본인 이직 시 실제 사용
- **포트폴리오**: 멀티에이전트/RAG/풀스택 역량 증명
- **잠재 SaaS**: 향후 친구/지인 베타 → 일반 사용자 배포

### 1.4 차별화 포인트
1. **항목별 자소서 생성**: 자기소개/지원동기/성장과정 등 자유 조합
2. **프로젝트 문서 RAG**: README/CHANGELOG/docs까지 인덱싱 (핵심 차별점)
3. **피드백 루프 멀티에이전트**: 작성→평가→재작성 사이클 시각화
4. **커리어 타임라인 추론**: 단순 키워드 매칭이 아닌 커리어 흐름 이해
5. **자소서 라이브러리 + 버전 관리**: 합격 태깅으로 데이터 누적
6. **글자수 정확 검증**: Python 카운팅 + LLM 재작성 분리
7. **멀티 LLM 프로바이더**: Claude/GPT/Gemini/Ollama 사용자 선택
8. **에이전트별 모델 선택**: 비용/품질 사용자가 직접 컨트롤

---

## 2. 목표와 비전

### 2.1 단기 (3개월, ~2026-08)
- MVP 동작 완성
- 본인 이직 시 실사용
- 포트폴리오용 데모 가능

### 2.2 중기 (6개월, ~2026-11)
- 클라우드 배포 (멀티유저)
- 친구/지인 베타 테스트
- 노드 그래프 UI 추가 (Dify 벤치마킹)

### 2.3 장기 (1년, ~2027-05)
- 면접 코치, 매칭 분석 기능 확장
- 정식 SaaS 검토
- 오픈소스 공개 검토

---

## 3. 사용자 시나리오

### 3.1 페르소나 A: 본인 (기환)
> 4개월차 AI 연구원. 정부과제 멀티에이전트 개발 경험.
> 평일 저녁/주말 자소서 작성. 회사마다 다시 쓰기 귀찮음.
> GitHub 프로젝트 README 잘 정리되어 RAG 데이터 풍부.

**시나리오:**
1. 원티드에서 흥미로운 공고 발견
2. 공고 텍스트 복사 → HireAgent에 붙여넣기 (또는 URL 입력)
3. "자기소개(500자), 지원동기(800자), 직무 경험(1000자)" 선택
4. 톤: "공식적", 페르소나: "제조→AI 전환 중인 경력직"
5. 에이전트별 모델 선택 (작성: Claude Opus, 평가: Haiku, 압축: Ollama)
6. RAG에서 LangGraph 경험, CNC 도메인 등 자동 추출
7. 글자수 정확히 맞춰진 초안 생성
8. 본인이 다듬어서 사이트에 복붙
9. 합격 결과 태깅 → 라이브러리 누적

### 3.2 페르소나 B: 일반 구직자 (Phase 3)
> 신입~3년차. 본인 GitHub 있음. 자소서 부담.

**시나리오:**
1. 회원가입 → API 키 입력 (Claude/GPT 본인 키)
2. GitHub URL 입력 → 자동 RAG 인덱싱
3. 이력서 업로드 → 추가 인덱싱
4. 공고별 자소서 생성 사용
5. 합격/탈락 태깅으로 데이터 누적

---

## 4. 기능 요구사항

### 4.1 Phase 1: MVP (3개월)

#### 4.1.1 데이터 인풋
- **F-1.1**: 이력서 업로드 (PDF/DOCX/MD)
- **F-1.2**: 자소서 업로드 (텍스트)
- **F-1.3**: GitHub 레포 URL → README/CHANGELOG/docs 자동 인덱싱
- **F-1.4**: 로컬 폴더 업로드 (마크다운 일괄)
- **F-1.5**: 직접 텍스트 입력 (커스텀 경험/프로젝트)

#### 4.1.2 공고 분석
- **F-2.1**: 공고 직접 텍스트 붙여넣기 (메인 방식, IP 차단 위험 0)
- **F-2.2**: 공고 URL 입력 (선택, 공개 페이지만)
  - 우선순위: 원티드 > 사람인 > 잡플래닛 > 점핏
- **F-2.3**: 회사명 추출 → 회사 정보 보강 (선택)

#### 4.1.3 자소서 항목 선택
- **F-3.1**: 프리셋 카테고리 다중 선택
  - 인성/기본, 지원동기/포부, 경험/역량, 직무 역량, 회사/직무 분석, 가치관
- **F-3.2**: 각 항목별 글자수 자유 입력
- **F-3.3**: 공백 포함/제외 옵션
- **F-3.4**: 커스텀 항목 추가 (이름 + 글자수 + 의도)
- **F-3.5**: 톤 선택 (공식적/친근함/도전적) + 자유 입력
- **F-3.6**: 페르소나 선택 (신입/경력/전환) + 자유 입력

#### 4.1.4 멀티에이전트 생성
- **F-4.1**: 공고 분석 에이전트 (회사 인재상 추출)
- **F-4.2**: 커리어 RAG 검색 에이전트 (메타데이터 필터)
- **F-4.3**: 작성 에이전트 (항목별 병렬)
- **F-4.4**: 자가 평가 에이전트 (품질 점검)
- **F-4.5**: 재작성 에이전트 (피드백 반영)
- **F-4.6**: 글자수 검증 (Python 순수 함수)
- **F-4.7**: 압축/확장 에이전트 (글자수 조정)

#### 4.1.5 멀티 LLM 프로바이더 (← v0.2 추가)
- **F-5.1**: 사용자 UI에서 API 키 입력
  - Anthropic, OpenAI, Google, Ollama, HuggingFace
- **F-5.2**: API 키 암호화 저장 (AES-256)
- **F-5.3**: 프로바이더별 모델 목록 동적 로딩
- **F-5.4**: 에이전트별 모델 선택 가능
  - 작성: 고성능 모델 (Opus/GPT-5)
  - 평가/압축: 경량 모델 (Haiku/Mini)
  - 옵션: 모든 에이전트 동일 모델
- **F-5.5**: 로컬 LLM (Ollama) 지원
  - Endpoint URL 입력
  - 설치된 모델 자동 감지
- **F-5.6**: 사용량/비용 표시 (선택)

#### 4.1.6 자소서 라이브러리
- **F-6.1**: 항목별 저장 (카테고리 자동 분류)
- **F-6.2**: 버전 관리 (회사명, 날짜, 글자수)
- **F-6.3**: 합격 여부 태깅 (서류/면접/최종/탈락)
- **F-6.4**: 검색/필터
- **F-6.5**: 새 자소서 작성 시 라이브러리 항목 참고

#### 4.1.7 프로젝트 카드
- **F-7.1**: 인덱싱된 프로젝트 자동 요약
- **F-7.2**: 기간/역할/스택/성과 추출
- **F-7.3**: 자소서 인용 횟수 표시
- **F-7.4**: 수동 편집 가능

### 4.2 Phase 2: 확장 (6개월)

- **F-8.1**: 면접 코치 (예상 질문 + 답변 가이드)
- **F-8.2**: 매칭 분석 (공고-이력서 적합도 점수)
- **F-8.3**: 회사 분석 (잡플래닛 평점, 산업 트렌드)
- **F-8.4**: 노드 그래프 UI (워크플로우 시각화, React Flow)
- **F-8.5**: 커리어 타임라인 시각화
- **F-8.6**: 브라우저 확장프로그램 (공고 페이지에서 원클릭 전송)

### 4.3 Phase 3: 배포/SaaS (1년)

- **F-9.1**: 사용자 인증 (OAuth, Google/GitHub)
- **F-9.2**: 멀티테넌시 강화
- **F-9.3**: 사용량 분석 대시보드
- **F-9.4**: 결제 (선택)

---

## 5. 비기능 요구사항

### 5.1 성능
- 자소서 항목 1개 생성: 30초 이내 (글자수 검증 포함)
- 항목 3개 병렬 생성: 60초 이내
- RAG 검색: 2초 이내
- 동시 사용자: Phase 1 단일, Phase 3 100명까지

### 5.2 정확성
- 글자수: ±5% 이내 (Python 카운팅 100% 정확)
- RAG 검색: 상위 5개 결과 관련성 80% 이상

### 5.3 보안
- API 키: 환경변수 또는 DB에 AES-256 암호화
- 사용자 데이터 암호화 (Phase 3)
- 사용자별 데이터 분리 (멀티테넌시)
- 메모리에서 API 키 즉시 제거 (요청 후)

### 5.4 비용
- 개발자 비용 (자체 운영): $0~5/월 (DB만 운영)
- 사용자 비용 (본인 API 키): 사용량에 따라
- 클라우드 호스팅 (Phase 3): $5~20/월

### 5.5 사용성
- 한국어 우선 (영어 추후)
- 모바일 대응 (Phase 2 이후)
- 다크 모드 지원

---

## 6. 기술 스택

### 6.1 백엔드
- **언어**: Python 3.11+
- **프레임워크**: FastAPI (REST API only)
- **에이전트**: LangGraph
- **RAG**: pgvector (PostgreSQL 내장) ← v0.2 변경
- **임베딩**: BGE-M3 또는 KURE-v1 (한국어 특화) ← v0.2 변경
- **DB**: PostgreSQL (메타데이터 + 벡터 통합)
- **캐시**: Redis (선택)
- **타입**: Pydantic v2

### 6.2 LLM (멀티 프로바이더)
- **Anthropic Claude**: Opus/Sonnet/Haiku
- **OpenAI**: GPT-5, GPT-5 mini
- **Google**: Gemini 2.5 Pro/Flash
- **Ollama**: EXAONE 3.5, Llama 3.3, Qwen 등 (로컬)
- **추상화**: llm_factory.py로 통합 인터페이스

### 6.3 프론트엔드 ← v0.2 변경 (Jinja2 → Next.js)
- **프레임워크**: Next.js 14+ (App Router)
- **언어**: TypeScript (필수)
- **스타일**: TailwindCSS
- **컴포넌트**: shadcn/ui
- **상태관리**: React Query (서버 상태) + Zustand (클라이언트 상태)
- **워크플로우 UI (Phase 2)**: React Flow
- **폼**: React Hook Form + Zod

### 6.4 인프라
- **개발**: Docker Compose (처음부터)
- **백엔드 배포 (Phase 3)**: Railway 또는 Fly.io
- **프론트 배포 (Phase 3)**: Vercel
- **저장소**: GitHub (private → Phase 3에서 public 검토)

### 6.5 도구
- **버전 관리**: Git + GitHub
- **개발 환경**: VSCode + Claude Code
- **문서화**: Markdown (살아있는 문서)
- **API 테스트**: Postman 또는 Bruno

---

## 7. 아키텍처 개요

### 7.1 상위 구조 (분리형 아키텍처)
```
┌────────────────────────────────────────────────┐
│  프론트엔드 (Next.js + TypeScript)              │
│  - 페이지 라우팅, 컴포넌트                       │
│  - shadcn/ui, TailwindCSS                      │
│  - React Query (서버 상태)                      │
└─────────────────┬──────────────────────────────┘
                  │ REST API (JSON)
┌─────────────────▼──────────────────────────────┐
│  백엔드 (FastAPI)                                │
│  ┌──────────────────────────────────────────┐  │
│  │   LangGraph 오케스트레이터                │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │  │
│  │  │ JD  │ │ RAG │ │작성  │ │평가  │       │  │
│  │  └─────┘ └─────┘ └─────┘ └─────┘        │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐                 │  │
│  │  │재작성│ │ 검증 │ │압축  │                │  │
│  │  └─────┘ └─────┘ └─────┘                 │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │   LLM Factory (멀티 프로바이더 추상화)     │  │
│  │   Claude / GPT / Gemini / Ollama / HF    │  │
│  └──────────────────────────────────────────┘  │
└────┬───────────────────────┬───────────────────┘
     │                       │
┌────▼─────────────┐  ┌──────▼──────┐
│ PostgreSQL +     │  │   Ollama    │
│ pgvector         │  │  (로컬 LLM)  │
│ (메타+벡터 통합) │  │             │
└──────────────────┘  └─────────────┘
```

### 7.2 LLM Factory 구조 (v0.2 신규)
```python
# 사용자 설정 예시
user_llm_config = {
    "providers": {
        "anthropic": {
            "api_key": "encrypted_key_xxx",
            "models": ["claude-opus-4-7", "claude-haiku-4-5"]
        },
        "openai": {
            "api_key": "encrypted_key_yyy",
            "models": ["gpt-5", "gpt-5-mini"]
        },
        "ollama": {
            "endpoint": "http://localhost:11434",
            "models": ["exaone3.5:7.8b", "llama3.3:70b"]
        }
    },
    "agent_assignments": {
        "essay_writer": {
            "provider": "anthropic",
            "model": "claude-opus-4-7"
        },
        "evaluator": {
            "provider": "anthropic",
            "model": "claude-haiku-4-5"
        },
        "compressor": {
            "provider": "ollama",
            "model": "exaone3.5:7.8b"
        },
        "jd_analyzer": {
            "provider": "openai",
            "model": "gpt-5-mini"
        }
    }
}

class LLMFactory:
    @staticmethod
    def create_for_agent(agent_name: str, user_config: dict):
        assignment = user_config["agent_assignments"][agent_name]
        provider = assignment["provider"]
        model = assignment["model"]
        api_key = decrypt(user_config["providers"][provider]["api_key"])
        return ProviderClient(provider, model, api_key)
```

### 7.3 RAG 데이터 구조 (pgvector)
```python
# PostgreSQL 테이블 스키마
class CareerDocument(Base):
    __tablename__ = "career_documents"
    
    id: int (PK)
    user_id: str  # 멀티테넌시
    content: str
    embedding: Vector(1024)  # BGE-M3 차원
    
    # 메타데이터
    source_type: str  # "project_readme" | "resume" | "essay" | ...
    project_name: str
    tech_stack: list[str]  # JSONB
    date_range: str
    category: str  # "trouble_shooting" | "collaboration" | ...
    company: str
    role: str
    indexed_at: datetime
```

### 7.4 자소서 생성 파이프라인
```
[입력] 공고 + 항목 + 글자수 + 톤/페르소나 + 모델 선택
   │
   ▼
[공고 분석 에이전트] ─ 회사 인재상, 키워드, 직무 요구사항
   │
   ▼
[항목별 병렬 처리]
   │
   ├─[RAG 검색]─ 메타데이터 필터로 관련 경험 추출
   │     │
   │     ▼
   ├─[작성 에이전트]─ 초안 생성
   │     │
   │     ▼
   ├─[글자수 검증 (Python)]
   │   ┌───┴───┐
   │   ▼       ▼
   │  OK    미달/초과
   │         │
   │         ▼
   │  [압축/확장 에이전트]
   │         │
   │         ▼
   │  [재검증] (최대 3회)
   │   │
   │   ▼
   ├─[자가 평가 에이전트]─ 품질 점수
   │     │
   │     ▼
   └─[재작성 에이전트]─ 최종본
        │
        ▼
[출력] 항목별 자소서 + 인용 근거 + 개선 제안
```

---

## 8. 마일스톤 (가속화)

### M1: 기반 구축 ✅ 완료 (2026-05-24)
- [x] 프로젝트 초기 세팅 (모노레포 backend/ + frontend/)
- [x] Docker Compose (FastAPI + Postgres+pgvector + Ollama GPU + Next.js)
- [x] LLM Factory 골격 (Anthropic + Ollama + OpenAI stub + Google stub)
- [x] Next.js 16 + shadcn/ui + LLM 테스트 페이지
- [x] 살아있는 문서 워크플로우 확립 (CLAUDE.md + ADR 001-011)
- [x] RTX 5060 GPU passthrough → Ollama ~82 tokens/sec
- ~~기본 RAG 파이프라인~~ → M4에서 구현

### M2: 코어 에이전트 + DB ✅ 완료 (2026-05-24)
- [x] 공고 텍스트 분석 에이전트 (`jd_analyzer.py`)
- [x] 작성 에이전트 + 글자수 검증 (`essay_writer.py` + `char_counter.py`)
- [x] 자가 평가 + 재작성 루프 (`evaluator.py` + `compressor.py`, ≤3회)
- [x] LangGraph 병렬 처리 (`Send` API + ItemState 서브그래프, ADR-015)
- [x] SQLAlchemy 2.0 async + asyncpg + Alembic (ADR-016)
- [x] DB 모델 4개 (CareerDocument, JobApplication, EssayLibraryItem, UserLLMConfig)
- [x] `POST /api/v1/essays/generate` SSE 스트리밍 (ADR-012)

### M3: UI 핵심 ✅ 완료 (2026-05-24)
- [x] 공고 입력 페이지 (`/generate` 4단계 플로우)
- [x] 항목 선택 + 글자수/톤/페르소나 UI
- [x] 결과 확인 페이지 (SSE 실시간 진행상황 + 글자수/평가 배지)
- [x] 설정 페이지 (`/settings`, 에이전트별 API 키/모델, localStorage)
- [x] shadcn/ui 컴포넌트 (button/card/select/badge/input/textarea/label/separator)

### M4: 데이터 레이어 + RAG ✅ 완료 (2026-05-24)
- [x] 자소서 라이브러리 API + UI (`/library`, 합격 태깅)
- [x] 지원 관리 API + UI (`/jobs`, JobApplication 상태 머신)
- [x] RAG 인덱서 (KURE-v1 한국어 SOTA 임베딩, ADR-017)
- [x] RAG 검색기 (pgvector cosine + user_id 필터)
- [x] LangGraph 통합 (`retrieve → write → ...`, ItemState.rag_context)
- [x] `/projects` 페이지 (텍스트 인덱싱 + 검색 테스트 + 청크 관리)
- [x] URL 페칭 보조 입력 (ADR-018, ADR-009 구체 구현)
- [ ] GitHub URL 자동 인덱싱 → M5 또는 향후 (Phase 2 F-8.6 브라우저 확장과 연계 검토)
- [ ] 프로젝트 카드 자동 생성 → M5 또는 향후 (Phase 2 기능)

### M5: 본인 실사용 (진행 중)
- [ ] 실제 이직 지원에 사용
- [ ] 피드백으로 개선
- [ ] 합격 자소서 데이터 축적

**실제 완료**: M1-M4 1일 (2026-05-24) — 가속화 페이스

---

## 9. 리스크와 대응

### 9.1 기술 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 채용 사이트 크롤링 차단/IP 밴 | 높음 | **메인은 사용자 텍스트 붙여넣기**, URL은 보조 |
| LLM 한국어 글자수 부정확 | 중간 | Python 카운팅 + 압축/확장 에이전트 분리 |
| 사용자 API 키 유출 | 매우 높음 | AES-256 암호화 + 메모리 즉시 제거 + HTTPS 강제 |
| API 비용 폭주 | 중간 | 에이전트별 경량 모델 + Ollama 폴백 + 사용량 표시 |
| RAG 검색 품질 낮음 | 중간 | BGE-M3 임베딩 + 메타데이터 필터 + 재순위화 |
| Next.js 학습 곡선 | 낮음 | Claude Code 활용 + shadcn/ui로 디자인 부담 ↓ |

### 9.2 일정 리스크

| 리스크 | 대응 |
|--------|------|
| 본업과 병행 진행 더딤 | 주당 최소 8시간 확보 (평일 1h x 5 + 주말 3h) |
| 기능 욕심으로 MVP 못 끝냄 | Phase 범위 엄격 고수 |
| 외부 API 정책 변경 | 어댑터 패턴으로 추상화 |

### 9.3 보안/윤리 리스크

| 리스크 | 대응 |
|--------|------|
| 채용 사이트 자동화 정책 위반 | 자동 입력 기능 제외, 사용자 복붙 |
| 자소서 표절 이슈 | 사용자 본인 데이터만 사용, AI 생성 명시 |
| 개인정보 유출 | 암호화 + RBAC (Phase 3) |

---

## 10. 의사결정 기록 (ADR)

### ADR-001: 글자수 검증은 LLM 미사용
- **결정**: Python `len()` 사용, LLM은 압축/확장만
- **근거**: LLM은 토큰 단위, 한국어 글자수 부정확
- **결과**: 100% 정확한 검증

### ADR-002: 채용 사이트 자동 입력 미지원
- **결정**: 사이트별 자동 입력 제외, 사용자 복붙
- **근거**: UI 변경 시 망가짐, 보안 이슈, IP 밴 위험
- **결과**: 항목별 자소서 생성에 집중

### ADR-003: 처음부터 멀티유저 설계
- **결정**: 단일 사용자여도 user_id 적용
- **근거**: Phase 3 배포 시 재설계 비용 큼
- **결과**: 초기 복잡도 증가, 장기 유리

### ADR-004: pgvector 채택 (v0.2 변경)
- **결정**: Chroma 대신 PostgreSQL + pgvector
- **근거**: DB 통합 운영, 백업 일원화, 메타데이터 + 벡터 같은 곳
- **결과**: 운영 단순, 트랜잭션 일관성

### ADR-005: BGE-M3/KURE-v1 임베딩 (v0.2 변경)
- **결정**: nomic-embed-text 대신 한국어 강한 임베딩
- **근거**: 한국 자소서 도메인이라 한국어 성능 필수
- **결과**: 검색 품질 향상

### ADR-006: LangGraph 채택
- **결정**: 멀티에이전트 오케스트레이션
- **근거**: 회사 경험 보유, 병렬 노드 노하우
- **결과**: 학습 비용 0

### ADR-007: 처음부터 Next.js (v0.2 변경)
- **결정**: Jinja2 단계 생략, Next.js + TypeScript 직행
- **근거**:
  - 채용 시장에서 React/Next.js 압도적
  - Claude Code가 React에 최적화
  - Jinja2 → Next.js 마이그레이션 비용 회피
  - 풀스택 AI 엔지니어 포트폴리오 임팩트
- **결과**: 초반 약간 느릴 수 있으나 장기적 유리

### ADR-008: 멀티 LLM 프로바이더 (v0.2 신규)
- **결정**: Claude/GPT/Gemini/Ollama 모두 지원
- **근거**:
  - 사용자가 본인 API 키로 비용 관리
  - 에이전트별 최적 모델 선택 가능
  - Dify 벤치마킹 컨셉
- **결과**: 차별화 강화, 구현 복잡도 증가

### ADR-009: 공고 입력은 텍스트 우선 (v0.2 명시)
- **결정**: URL 크롤링은 보조, 직접 붙여넣기가 메인
- **근거**: IP 밴 사례 다수, 사이트 정책 변경 빈번
- **결과**: 사용자 액션 1번 추가, 안정성 확보 (ADR-018에서 보조 URL 페칭 구체화)

### ADR-010~018 (요약)
| ID | 결정 | 단계 |
|----|------|------|
| 010 | HireAgent 전용 Ollama 컨테이너 분리 | M1 |
| 011 | LLM Factory 레지스트리 패턴 | M1 |
| 012 | 자소서 생성 응답은 SSE 스트리밍 | M2 |
| 013 | JobApplication 모델로 자소서-공고 연결 | M2 |
| 014 | Phase 3 Ollama는 로컬 전용 (서버 미배포) | M1 |
| 015 | LangGraph `Send` API + 항목 서브그래프 | M2 |
| 016 | SQLAlchemy async + asyncpg (Alembic sync) | M2 |
| 017 | KURE-v1 임베딩 (sentence-transformers, 한국어 SOTA) | M4 |
| 018 | URL 페칭 보조 입력 (httpx + BeautifulSoup) | M4 |

상세: [`docs/adr/`](adr/) 폴더 또는 [`docs/README.md`](README.md) 인덱스 참고.

---

## 11. 다음 단계

### 11.1 즉시 시작 (M1)
- [ ] GitHub 레포 생성 (private)
- [ ] 프로젝트 구조 잡기 (모노레포 또는 backend/frontend 분리)
- [ ] Docker Compose 작성
- [ ] FastAPI 기본 골격
- [ ] Next.js 초기화
- [ ] PostgreSQL + pgvector Docker 이미지 사용
- [ ] LLM Factory 골격

### 11.2 추가로 잡아야 할 문서
- [x] `architecture.md` - 상세 아키텍처 (M2~M4 구현 매핑 포함)
- [x] `CHANGELOG.md` - 변경 이력 (v0.0.1~v0.6.0)
- [x] `erd.md` - DB 스키마 (Mermaid ERD, M4 시점 확정)
- [x] `api_design.md` 역할 - FastAPI `/docs` 자동 생성 + `architecture.md §3` 흐름도로 대체
- [x] `frontend_design.md` 역할 - M3/M4 페이지가 곧 명세 (`/generate`, `/library`, `/jobs`, `/projects`, `/settings`)
- ~~`agents.md`~~ - 별도 문서 대신 `architecture.md §2 M2 구현 매핑` + ADR-015로 통합

### 11.3 검토 후 확정
- [x] 모노레포 vs 분리 레포 결정 → **모노레포** (backend/, frontend/ 한 레포)
- [x] 라이선스 → **MIT**
- [ ] 도메인 등록 여부 (hireagent.io / .ai)

---

## 12. 용어 정리

| 용어 | 설명 |
|------|------|
| **MVP** | Minimum Viable Product, 최소 기능 제품 |
| **RAG** | Retrieval Augmented Generation, 검색 증강 생성 |
| **LLM** | Large Language Model |
| **ADR** | Architecture Decision Record, 아키텍처 의사결정 기록 |
| **pgvector** | PostgreSQL용 벡터 검색 확장 |
| **LangGraph** | 멀티에이전트 워크플로우 프레임워크 |
| **shadcn/ui** | Tailwind 기반 React 컴포넌트 라이브러리 |
| **모노레포** | 여러 프로젝트를 하나의 Git 저장소에 관리 |
