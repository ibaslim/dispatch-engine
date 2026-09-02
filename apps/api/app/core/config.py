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
    google_maps_api_key: str = ""
    # Use a server-restricted key for Places/Routes calls when available.
    # Local development can fall back to the browser key above.
    google_maps_server_api_key: str = ""

    # Pusher Channels. The key and cluster are browser-safe; the app secret is
    # server-only and must never be included in a frontend bundle.
    pusher_app_id: str = ""
    pusher_key: str = ""
    pusher_secret: str = ""
    pusher_cluster: str = ""

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

    # File uploads
    uploads_dir: str = "data/uploads"

    # Driver location tracking
    # Grace period after a driver's last ping; also gates push offer targeting.
    driver_presence_window_seconds: int = 120
    driver_location_flush_interval_seconds: int = 60
    # Enforced daily by purge_driver_location_logs; 0 or less disables the purge.
    driver_location_retention_days: int = 30
    driver_location_active_order_negative_cache_seconds: int = 300
    # Caps the per-driver Redis buffer so a stalled flusher drops points, not memory.
    driver_location_history_max_records: int = 10000

    # Firebase Cloud Messaging. This credential can push to every driver device,
    # so it is server-only and must never reach a frontend bundle.
    #
    # The downloaded service-account key, pasted inline as a single line. One
    # form only, deliberately: the key's PEM newlines are already escaped as
    # "\n" *inside* the JSON, so json.loads restores them and nothing has to be
    # repaired by hand. Splitting it into separate fields is what produces the
    # classic "Could not deserialize key data"; a file path would be one more
    # artifact to deploy, mount and accidentally commit.
    firebase_credentials_json: str = ""
    # Kill switch: silences all push without a deploy or credential change.
    fcm_enabled_flag: bool = True

    @property
    def pusher_enabled(self) -> bool:
        return all(
            (
                self.pusher_app_id.strip(),
                self.pusher_key.strip(),
                self.pusher_secret.strip(),
                self.pusher_cluster.strip(),
            )
        )

    @property
    def fcm_enabled(self) -> bool:
        """False on machines with no credential, so push degrades to silence."""
        return self.fcm_enabled_flag and bool(self.firebase_credentials_json.strip())


settings = Settings()

