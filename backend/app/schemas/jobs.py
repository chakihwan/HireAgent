from datetime import datetime

from pydantic import BaseModel, Field


class JobApplicationCreate(BaseModel):
    company: str = Field(..., min_length=1, max_length=256)
    position: str | None = Field(default=None, max_length=256)
    job_description: str = Field(..., min_length=1)
    job_url: str | None = Field(default=None, max_length=2048)
    deadline: datetime | None = None


class JobApplicationUpdate(BaseModel):
    company: str | None = Field(default=None, max_length=256)
    position: str | None = Field(default=None, max_length=256)
    status: str | None = Field(default=None)
    applied_at: datetime | None = None
    result_notes: str | None = None


class JobApplicationResponse(BaseModel):
    id: int
    user_id: str
    company: str
    position: str | None
    job_description: str
    job_url: str | None
    applied_at: datetime | None
    deadline: datetime | None
    status: str
    result_notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
