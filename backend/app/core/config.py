from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "RecordShield API"
    environment: str = "development"
    database_url: str
    session_secret: str
    m1_test_key: str = "m1-development-only"
    secure_cookies: bool = True
    mercy_emr_url: str = "http://localhost:8001"
    mercy_emr_service_key: str = "mercy-emr-dev-service-key"
    source_timeout_seconds: float = 5.0
    audit_service_url: str = "http://localhost:8002"
    audit_service_key: str = "audit-dev-service-key"
    audit_timeout_seconds: float = 5.0
    audit_worker_enabled: bool = True
    audit_worker_interval_seconds: float = 5.0

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        value = value.strip()
        if value.startswith("mysql://"):
            return "mysql+asyncmy://" + value[len("mysql://") :]
        if value.startswith("mysql+asyncmy://"):
            return value
        raise ValueError("DATABASE_URL must be a MySQL URL (mysql:// or mysql+asyncmy://)")


settings = Settings()
