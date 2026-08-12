from celery import Celery
from kombu import Exchange, Queue

from app.core.config import settings

HIGH_PRIORITY_QUEUE = "high_priority"
DEFAULT_QUEUE = "default"
LOW_PRIORITY_QUEUE = "low_priority"

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
    task_default_queue=DEFAULT_QUEUE,
    task_default_exchange=DEFAULT_QUEUE,
    task_default_routing_key=DEFAULT_QUEUE,
    task_queues=(
        Queue(HIGH_PRIORITY_QUEUE, Exchange(HIGH_PRIORITY_QUEUE), routing_key=HIGH_PRIORITY_QUEUE),
        Queue(DEFAULT_QUEUE, Exchange(DEFAULT_QUEUE), routing_key=DEFAULT_QUEUE),
        Queue(LOW_PRIORITY_QUEUE, Exchange(LOW_PRIORITY_QUEUE), routing_key=LOW_PRIORITY_QUEUE),
    ),
    task_routes={
        "send_invitation_email": {"queue": HIGH_PRIORITY_QUEUE, "routing_key": HIGH_PRIORITY_QUEUE},
        "send_password_reset_email": {"queue": HIGH_PRIORITY_QUEUE, "routing_key": HIGH_PRIORITY_QUEUE},
        "send_onboarding_submitted_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_onboarding_approved_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_onboarding_rejected_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_tenant_suspended_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_tenant_unsuspended_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_order_sender_invoice_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_order_recipient_notification_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_order_delivered_email": {
            "queue": HIGH_PRIORITY_QUEUE,
            "routing_key": HIGH_PRIORITY_QUEUE,
        },
        "send_push_notification": {"queue": DEFAULT_QUEUE, "routing_key": DEFAULT_QUEUE},
        "flush_driver_location_logs": {"queue": LOW_PRIORITY_QUEUE, "routing_key": LOW_PRIORITY_QUEUE},
    },
    worker_prefetch_multiplier=1,
    beat_schedule={
        "flush-driver-location-logs-periodic": {
            "task": "flush_driver_location_logs",
            "schedule": float(settings.driver_location_flush_interval_seconds),
        },
    },
)
