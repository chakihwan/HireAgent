from pydantic import BaseModel, Field


class OllamaModel(BaseModel):
    name: str
    size: int
    parameter_size: str
    quantization_level: str


class OllamaModelsResponse(BaseModel):
    models: list[OllamaModel]


class OlamaPullRequest(BaseModel):
    model: str = Field(..., description="예: exaone3.5:7.8b, gemma4:e2b, deepseek-r1:7b")


class OllamaPullProgress(BaseModel):
    status: str
    total: int = 0
    completed: int = 0
    percent: float = 0.0
