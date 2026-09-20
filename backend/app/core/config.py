from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "RecordShield API"
    environment: str = "development"
    database_url: str
    session_secret: str


settings = Settings()
