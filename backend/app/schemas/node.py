"""대화형 단계 실행 — 노드 단위 실행 스키마 (ADR-031)."""

from pydantic import BaseModel, Field


class ModelChoice(BaseModel):
    """후보 하나를 만들 LLM (N=모델 다양화 — ADR-031 #3)."""

    provider: str
    model: str
    api_key: str = ""


class JDAnalyzeRequest(BaseModel):
    job_description: str = Field(..., min_length=10)
    # 각 모델로 1개씩 분석 → 후보 N개 (사용자가 비교·택1)
    models: list[ModelChoice] = Field(..., min_length=1, max_length=5)
    user_id: str = Field(default="local")


class JDAnalyzeCandidate(BaseModel):
    jd_analysis: str
    target_company: str
    provider: str
    model: str


class JDAnalyzeResponse(BaseModel):
    candidates: list[JDAnalyzeCandidate]


# ── 작성 노드 (ADR-031 C) ──


class WriteRequest(BaseModel):
    jd_analysis: str = Field(..., min_length=1)
    target_company: str = "알 수 없음"
    category: str = Field(..., min_length=1)
    char_limit: int = Field(..., ge=50, le=2000)
    tone: str | None = None
    persona: str | None = None
    rag_context: list[str] = Field(default_factory=list)  # 없으면 빈(RAG 큐레이션은 단계 D)
    models: list[ModelChoice] = Field(..., min_length=1, max_length=5)
    user_id: str = Field(default="local")


class WriteCandidate(BaseModel):
    content: str
    char_count: int
    provider: str
    model: str


class WriteResponse(BaseModel):
    candidates: list[WriteCandidate]


# ── RAG 검색 (ADR-031 D, 큐레이션용) ──


class RagSearchRequest(BaseModel):
    jd_analysis: str = Field(..., min_length=1)  # 직무 기반 (항목 무관 — "내 경험" 단계)
    user_id: str = Field(default="local")


class RagSource(BaseModel):
    content: str          # 작성에 넘길 전체 청크 (선택 시 rag_context로)
    source_type: str
    project_name: str | None = None
    snippet: str
    similarity: float


class RagSearchResponse(BaseModel):
    sources: list[RagSource]


# ── 직무 충족도 (ADR-032, 요구사항 ↔ 경험 매칭) ──


class CoverageRequest(BaseModel):
    jd_analysis: str = Field(..., min_length=1)  # "## 핵심 요구 역량" 불릿에서 요구 추출
    user_id: str = Field(default="local")


class CoverageMatch(BaseModel):
    project_name: str | None = None
    source_type: str
    similarity: float  # 이 요구와 해당 경험의 유사도 (0~1)


class RequirementCoverage(BaseModel):
    text: str
    matches: list[CoverageMatch]  # 이 요구를 충족하는 경험들 (유사도순). 비면 = 보강 필요


class CoverageResponse(BaseModel):
    requirements: list[RequirementCoverage]
