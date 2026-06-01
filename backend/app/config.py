from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_KEY = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql://hireagent:changeme@localhost:5432/hireagent"
    encryption_key: str = _DEFAULT_KEY
    ollama_base_url: str = "http://localhost:11434"
    # CORS 허용 origin (콤마 구분). 배포 시 env로 도메인 지정.
    cors_origins: str = "http://localhost:3000"

    app_name: str = "HireAgent"
    app_version: str = "0.1.0"
    debug: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("encryption_key")
    @classmethod
    def _validate_encryption_key(cls, v: str) -> str:
        """startup 시 ENCRYPTION_KEY 검증 (CLAUDE.md Rule #2).

        default 값/빈 값/유효하지 않은 Fernet 키면 앱 기동 차단.
        ("change-me-in-production"은 Fernet 키로도 invalid → 한 번에 걸러짐)
        """
        if not v or v == _DEFAULT_KEY:
            raise ValueError(
                "ENCRYPTION_KEY가 기본값이거나 비어 있습니다. .env에 실제 Fernet 키를 설정하세요.\n"
                "생성: python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\""
            )
        try:
            from cryptography.fernet import Fernet

            Fernet(v.encode())
        except Exception as e:  # noqa: BLE001 — 키 형식 오류를 명확한 메시지로 변환
            raise ValueError(
                f"ENCRYPTION_KEY가 유효한 Fernet 키가 아닙니다 ({e}). "
                "32-byte url-safe base64 키여야 합니다."
            ) from e
        return v


settings = Settings()
