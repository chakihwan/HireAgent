from datetime import datetime

from pydantic import BaseModel, Field


class CareerDocumentCreate(BaseModel):
    content: str = Field(..., min_length=20, description="원본 텍스트")
    source_type: str = Field(..., description="resume | essay | project_readme | project_doc | custom")
    project_name: str | None = None
    category: str | None = None
    company: str | None = None
    role: str | None = None
    tech_stack: list[str] = Field(default_factory=list)


class CareerDocumentResponse(BaseModel):
    id: int
    user_id: str
    content: str
    source_type: str
    project_name: str | None
    category: str | None
    company: str | None
    role: str | None
    tech_stack: list[str]
    indexed_at: datetime

    model_config = {"from_attributes": True}


class IndexResponse(BaseModel):
    """인덱싱 결과 요약."""
    chunks_created: int
    document_ids: list[int]


class GitHubIndexRequest(BaseModel):
    repo_url: str = Field(..., description="https://github.com/owner/repo")
    category: str | None = None
    tech_stack: list[str] = Field(default_factory=list)


class GitHubIndexResponse(BaseModel):
    owner: str
    repo: str
    description: str | None
    files_indexed: int
    total_chunks: int
    document_ids: list[int]


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=2)
    limit: int = Field(default=5, ge=1, le=20)
    source_type: str | None = None
    category: str | None = None
    project_name: str | None = None


class SearchResult(BaseModel):
    id: int
    content: str
    source_type: str
    project_name: str | None
    category: str | None
    distance: float
