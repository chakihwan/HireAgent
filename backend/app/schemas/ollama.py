from pydantic import BaseModel, Field


class GpuInfoSchema(BaseModel):
    name: str
    total_gb: float
    free_gb: float


class OllamaModel(BaseModel):
    name: str
    size: int
    parameter_size: str
    quantization_level: str
    # GPU 적합성 (런타임 VRAM 조회 기반, GPU 없으면 unknown)
    fit: str = "unknown"            # "ok" | "tight" | "over" | "unknown"
    required_gb: float = 0.0        # 추정 VRAM 필요량
    fit_message: str | None = None  # 경고 메시지 (ok/unknown이면 None)


class OllamaModelsResponse(BaseModel):
    models: list[OllamaModel]
    gpu: GpuInfoSchema | None = None  # GPU 정보 (없으면 null → 경고 비활성화)


class OlamaPullRequest(BaseModel):
    model: str = Field(..., description="예: exaone3.5:7.8b, gemma4:e2b, deepseek-r1:7b")


class OllamaPullProgress(BaseModel):
    status: str
    total: int = 0
    completed: int = 0
    percent: float = 0.0
