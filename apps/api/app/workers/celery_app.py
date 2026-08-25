from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "dispatch",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "flush-driver-location-logs-periodic": {
            "task": "flush_driver_location_logs",
            "schedule": float(settings.driver_location_flush_interval_seconds),
        },
        # Off-peak and daily: retention is a bulk delete, not a hot path.
        "purge-driver-location-logs-daily": {
            "task": "purge_driver_location_logs",
            "schedule": crontab(hour=3, minute=15),
        },
    },
)
