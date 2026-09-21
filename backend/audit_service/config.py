from pydantic_settings import BaseSettings, SettingsConfigDict


class AuditSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    audit_database_path: str = "audit.sqlite"
    audit_service_key: str = "audit-dev-service-key"


settings = AuditSettings()
