from datetime import datetime

from pydantic import BaseModel, Field


class EssayLibraryCreate(BaseModel):
    application_id: int | None = None
    category: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., min_length=1)
    char_target: int = Field(..., ge=100, le=5000)
    tone: str | None = None
    persona: str | None = None
    is_final: bool = False
    generation_metadata: dict | None = None


class EssayLibraryUpdate(BaseModel):
    content: str | None = None
    is_final: bool | None = None
    generation_metadata: dict | None = None


class EssayLibraryResponse(BaseModel):
    id: int
    user_id: str
    application_id: int | None
    category: str
    content: str
    char_count: int
    char_target: int
    tone: str | None
    persona: str | None
    version: int
    is_final: bool
    generation_metadata: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
