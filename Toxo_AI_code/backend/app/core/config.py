from functools import lru_cache

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "IA-Toxo"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    SECRET_KEY: str = Field(min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24

    DATABASE_URL: str

    CORS_ORIGINS: list[str] = []

    RESEND_API_KEY: str
    EMAIL_FROM: EmailStr
    EMAIL_FROM_NAME: str = "IA-Toxo"

    FRONTEND_URL: str


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
