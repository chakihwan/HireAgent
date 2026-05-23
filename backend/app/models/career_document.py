from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CareerDocument(Base):
    __tablename__ = "career_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)

    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024), nullable=True)

    # 메타데이터 (RAG 필터링용)
    source_type: Mapped[str] = mapped_column(String(64))
    # "resume" | "essay" | "project_readme" | "project_doc" | "custom"
    project_name: Mapped[str | None] = mapped_column(String(256))
    tech_stack: Mapped[list] = mapped_column(JSONB, default=list)
    category: Mapped[str | None] = mapped_column(String(128))
    company: Mapped[str | None] = mapped_column(String(256))
    role: Mapped[str | None] = mapped_column(String(256))

    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
