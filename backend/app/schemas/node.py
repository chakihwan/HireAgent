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
