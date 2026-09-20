from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "RecordShield API"
    environment: str = "development"
    database_url: str
    session_secret: str
    m1_test_key: str = "m1-development-only"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        value = value.strip()
        replacements = {
            "mysql://": "mysql+asyncmy://",
            "postgresql://": "postgresql+asyncpg://",
            "postgres://": "postgresql+asyncpg://",
        }
        for source, target in replacements.items():
            if value.startswith(source):
                return target + value[len(source) :]
        if value.startswith(("mysql+asyncmy://", "postgresql+asyncpg://")):
            return value
        raise ValueError(
            "DATABASE_URL must use a supported MySQL or PostgreSQL async URL"
        )


settings = Settings()
