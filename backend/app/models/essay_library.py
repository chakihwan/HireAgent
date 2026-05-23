from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class EssayLibraryItem(Base):
    __tablename__ = "essay_library"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    application_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("job_applications.id"), index=True
    )  # NULL → 자유 작성 (연습용)

    category: Mapped[str] = mapped_column(String(128))
    # "자기소개" | "지원동기" | "성장과정" | "직무경험" | ...
    content: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer)
    char_target: Mapped[int] = mapped_column(Integer)
    tone: Mapped[str | None] = mapped_column(String(64))
    persona: Mapped[str | None] = mapped_column(String(128))

    version: Mapped[int] = mapped_column(Integer, default=1)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)

    # 생성 컨텍스트 (재현/디버깅용)
    generation_metadata: Mapped[dict | None] = mapped_column(JSONB)
    # {"agent_assignments": {...}, "evaluation_score": 8.5, "iterations": 2}

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
