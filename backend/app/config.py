from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql://hireagent:changeme@localhost:5432/hireagent"
    encryption_key: str = "change-me-in-production"
    ollama_base_url: str = "http://localhost:11434"

    app_name: str = "HireAgent"
    app_version: str = "0.1.0"
    debug: bool = False


settings = Settings()
