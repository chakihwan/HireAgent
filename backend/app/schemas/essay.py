from pydantic import BaseModel, Field


class AgentAssignment(BaseModel):
    provider: str = Field(default="ollama")
    model: str = Field(default="exaone3.5:7.8b")
    api_key: str | None = Field(default=None, description="Ollama는 생략 시 서버 설정 사용")


class EssayItemRequest(BaseModel):
    category: str = Field(..., description="자기소개 | 지원동기 | 성장과정 | 직무경험 | ...")
    char_limit: int = Field(..., ge=50, le=5000, description="목표 글자수 (공백 포함)")
    tone: str | None = Field(default="공식적", description="공식적 | 친근함 | 도전적")
    persona: str | None = Field(default="경력직", description="신입 | 경력 | 전환")
    agent_config: dict[str, AgentAssignment] | None = Field(
        default=None,
        description="항목별 에이전트 설정 (없으면 전역 agent_config 사용)",
    )


class EssayGenerateRequest(BaseModel):
    job_description: str = Field(..., min_length=50, description="채용 공고 전문")
    items: list[EssayItemRequest] = Field(..., min_length=1, max_length=10)
    user_id: str = Field(default="local", description="사용자 ID (Phase 1: 단일 사용자)")
    agent_config: dict[str, AgentAssignment] = Field(
        default_factory=dict,
        description="에이전트별 LLM 설정. 미지정 시 Ollama exaone3.5:7.8b 사용",
    )


class DraftResult(BaseModel):
    category: str
    content: str
    char_count: int
    char_target: int
    iteration: int
    evaluation_score: float | None
    evaluation_feedback: str | None
    evaluation_scores: dict[str, float] | None = None  # 항목별 점수 (막대그래프)
    draft_history: list[dict] = []                      # 단계별 이력 (write/compress)


class EssayGenerateResponse(BaseModel):
    drafts: list[DraftResult]
    progress: list[str]
