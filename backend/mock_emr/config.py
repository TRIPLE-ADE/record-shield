from pydantic_settings import BaseSettings, SettingsConfigDict


class MockEmrSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mercy_emr_database_url: str = "mysql+asyncmy://mercy_emr:mercy_emr@localhost:3306/mercy_emr"
    mercy_emr_service_key: str = "mercy-emr-dev-service-key"


settings = MockEmrSettings()
