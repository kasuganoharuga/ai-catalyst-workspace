from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Catalyst API"
    app_env: str = "local"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    # No hardcoded default: the correct value depends on how the API is
    # started (docker-compose sets it to the `db` service hostname; local
    # non-Docker runs set it via .env to 127.0.0.1). A fixed default here
    # would silently be wrong in one of those contexts. Currently unused
    # (reserved for future AI/DB workflows); defaults to None so it's
    # explicit when it hasn't been configured.
    database_url: str | None = None
    ai_provider: str = ""
    ai_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
