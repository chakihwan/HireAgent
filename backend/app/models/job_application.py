from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class JobApplication(Base):
    __tablename__ = "job_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)

    # 공고 정보
    company: Mapped[str] = mapped_column(String(256))
    position: Mapped[str | None] = mapped_column(String(256))
    job_description: Mapped[str] = mapped_column(Text)
    job_url: Mapped[str | None] = mapped_column(String(2048))

    # 지원 메타데이터
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 결과
    status: Mapped[str] = mapped_column(String(32), default="draft")
    # "draft" | "submitted" | "passed_doc" | "passed_interview" | "passed_final"
    # | "rejected" | "withdrawn"
    result_notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
