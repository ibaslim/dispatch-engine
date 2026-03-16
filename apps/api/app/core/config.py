from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://dispatch:dispatch@localhost:5432/dispatch_dev"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # JWT
    jwt_secret_key: str = "changeme-insecure-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Invitation
    invitation_token_expire_hours: int = 72

    # URLs
    dispatcher_web_base_url: str = "http://localhost:4200"
    tracking_web_base_url: str = "http://localhost:4300"
    api_base_url: str = "http://localhost:8000"

    # CORS
    cors_origins: List[str] = [
        "http://localhost:4200",
        "http://localhost:4300",
        "http://localhost:19006",
    ]

    # Mail
    mail_host: str = "localhost"
    mail_port: int = 1025
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = "noreply@dispatch.local"
    mail_starttls: bool = False
    mail_ssl: bool = False


settings = Settings()
