from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UserLLMConfig(Base):
    __tablename__ = "user_llm_configs"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)

    # {provider: encrypted_api_key}
    encrypted_keys: Mapped[dict] = mapped_column(JSONB, default=dict)

    # {agent_name: {provider, model}}
    # e.g. {"essay_writer": {"provider": "anthropic", "model": "claude-opus-4-7"}}
    agent_assignments: Mapped[dict] = mapped_column(JSONB, default=dict)
