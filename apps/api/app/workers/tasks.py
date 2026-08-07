import base64

from app.workers.celery_app import celery_app
from app.services.email_service import (
    send_email_sync,
    build_invitation_email,
    build_onboarding_submitted_email,
    build_onboarding_approved_email,
    build_onboarding_rejected_email,
    build_tenant_suspended_email,
    build_tenant_unsuspended_email,
    build_order_invoice_message,
    build_order_invoice_pdf,
    build_order_delivered_email,
    build_order_recipient_email,
)
from typing import Any, Optional


@celery_app.task(name="send_invitation_email", bind=True, max_retries=3)
def send_invitation_email(
    self,
    email: Optional[str] = None,
    name: Optional[str] = None,
    tenant_name: Optional[str] = None,
    invite_token: Optional[str] = None,
    accept_url: Optional[str] = None,
    role: str = "member",
    **kwargs,
) -> None:
    email_value = email or kwargs.get("email") or ""
    name_value = name or kwargs.get("name") or ""
    tenant_name_value = tenant_name or kwargs.get("tenant_name") or ""
    invite_token_value = invite_token or kwargs.get("invite_token") or ""
    accept_url_value = accept_url or kwargs.get("accept_url") or ""
    role_value = role or kwargs.get("role") or "member"
    try:
        html = build_invitation_email(name_value, tenant_name_value, accept_url_value, role_value)
        send_email_sync(email_value, "You're invited to Dispatch Engine", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_password_reset_email", bind=True, max_retries=3)
def send_password_reset_email(self, email: str, reset_url: str) -> None:
    html = f"""
    <html><body>
    <p>Click the link to reset your password:</p>
    <a href="{reset_url}">Reset Password</a>
    <p>This link expires in 1 hour.</p>
    </body></html>
    """
    try:
        send_email_sync(email, "Reset your Dispatch Engine password", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


# ─── Push notifications ──────────────────────────────────────────────────────
#
# acks_late=False overrides the app-wide default: a redelivered offer after a
# worker crash may arrive with the 15-minute window already closed. Missing a
# push is recoverable via the app's REST refetch; ringing late is not.


def _run_with_session(coro_factory):
    """Run an async routine with its own engine, session and Redis client."""
    import asyncio
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.core.config import settings

    async def _run():
        engine = create_async_engine(settings.database_url, echo=False)
        session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        redis_client = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        try:
            async with session_factory() as session:
                return await coro_factory(session, redis_client)
        finally:
            await redis_client.aclose()
            await engine.dispose()

    return asyncio.run(_run())


@celery_app.task(name="notify_online_drivers_of_offer", acks_late=False)
def notify_online_drivers_of_offer(
    order_id: str,
    expires_at: str,
    exclude_tenant_id: str | None = None,
) -> int:
    """Notify on-shift drivers that a new order was published for bidding."""
    import logging
    from datetime import datetime
    from uuid import UUID

    from app.services.push_contract import build_offer_published
    from app.services.push_dispatch_service import notify_online_drivers

    logger = logging.getLogger(__name__)

    try:
        envelope = build_offer_published(
            order_id=order_id,
            expires_at=datetime.fromisoformat(expires_at),
        )
        if envelope.ttl_seconds <= 0:
            logger.info("Offer %s already expired before dispatch; not sending", order_id)
            return 0

        excluded = {UUID(exclude_tenant_id)} if exclude_tenant_id else set()
        return _run_with_session(
            lambda session, redis: notify_online_drivers(
                session, redis, envelope, exclude_tenant_ids=excluded
            )
        )
    except Exception:
        # No retry: the window may close before it lands, and the order is committed.
        logger.exception("Offer push failed for order %s", order_id)
        return 0


@celery_app.task(name="revoke_offer_notification", acks_late=False)
def revoke_offer_notification(order_id: str, exclude_tenant_id: str | None = None) -> int:
    """Clear an offer notification already showing on other drivers' phones."""
    import logging
    from uuid import UUID

    from app.services.push_contract import build_offer_revoked
    from app.services.push_dispatch_service import notify_online_drivers

    logger = logging.getLogger(__name__)

    try:
        envelope = build_offer_revoked(order_id=order_id)
        excluded = {UUID(exclude_tenant_id)} if exclude_tenant_id else set()
        return _run_with_session(
            lambda session, redis: notify_online_drivers(
                session, redis, envelope, exclude_tenant_ids=excluded
            )
        )
    except Exception:
        logger.exception("Offer revoke push failed for order %s", order_id)
        return 0


@celery_app.task(name="notify_driver_of_assignment", acks_late=False)
def notify_driver_of_assignment(
    order_id: str,
    order_number: str | None,
    driver_tenant_id: str,
    expires_at: str,
) -> int:
    """Tell a driver they were assigned an order. Not presence-gated."""
    import logging
    from datetime import datetime
    from uuid import UUID

    from app.services.push_contract import build_order_assigned
    from app.services.push_dispatch_service import send_envelope_to_tenants

    logger = logging.getLogger(__name__)

    try:
        envelope = build_order_assigned(
            order_id=order_id,
            order_number=order_number,
            expires_at=datetime.fromisoformat(expires_at),
        )
        return _run_with_session(
            lambda session, _redis: send_envelope_to_tenants(
                session, envelope, [UUID(driver_tenant_id)]
            )
        )
    except Exception:
        logger.exception("Assignment push failed for order %s", order_id)
        return 0


@celery_app.task(name="send_onboarding_submitted_email", bind=True, max_retries=3)
def send_onboarding_submitted_email(
    self,
    tenant_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    **kwargs,
) -> None:
    """Send email when onboarding application is submitted."""
    tenant_name_value = tenant_name or kwargs.get("tenant_name") or ""
    contact_email_value = contact_email or kwargs.get("contact_email") or ""
    try:
        html = build_onboarding_submitted_email(tenant_name_value, contact_email_value)
        send_email_sync(contact_email_value, "Your Application is Under Review", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_onboarding_approved_email", bind=True, max_retries=3)
def send_onboarding_approved_email(
    self,
    tenant_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    tenant_role: Optional[str] = None,
    **kwargs,
) -> None:
    """Send email when onboarding application is approved."""
    tenant_name_value = tenant_name or kwargs.get("tenant_name") or ""
    contact_email_value = contact_email or kwargs.get("contact_email") or ""
    tenant_role_value = tenant_role or kwargs.get("tenant_role") or kwargs.get("role") or ""
    try:
        html = build_onboarding_approved_email(tenant_name_value, tenant_role_value)
        send_email_sync(contact_email_value, "Welcome! Your Application is Approved", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_onboarding_rejected_email", bind=True, max_retries=3)
def send_onboarding_rejected_email(
    self,
    tenant_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    reason: Optional[str] = None,
    **kwargs,
) -> None:
    """Send email when onboarding application is rejected."""
    tenant_name_value = tenant_name or kwargs.get("tenant_name") or ""
    contact_email_value = contact_email or kwargs.get("contact_email") or ""
    reason_value = reason or kwargs.get("reason") or None
    try:
        html = build_onboarding_rejected_email(tenant_name_value, reason_value)
        send_email_sync(contact_email_value, "Application Status Update", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_tenant_suspended_email", bind=True, max_retries=3)
def send_tenant_suspended_email(
    self,
    tenant_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    reason: Optional[str] = None,
    **kwargs,
) -> None:
    """Send email when a tenant account is suspended."""
    tenant_name_value = tenant_name or kwargs.get("tenant_name") or ""
    contact_email_value = contact_email or kwargs.get("contact_email") or ""
    reason_value = reason or kwargs.get("reason") or None
    try:
        html = build_tenant_suspended_email(tenant_name_value, reason_value)
        send_email_sync(contact_email_value, "Account Suspended", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_tenant_unsuspended_email", bind=True, max_retries=3)
def send_tenant_unsuspended_email(
    self,
    tenant_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    **kwargs,
) -> None:
    """Send email when a tenant account is reactivated."""
    tenant_name_value = tenant_name or kwargs.get("tenant_name") or ""
    contact_email_value = contact_email or kwargs.get("contact_email") or ""
    try:
        html = build_tenant_unsuspended_email(tenant_name_value)
        send_email_sync(contact_email_value, "Account Reactivated", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_order_sender_invoice_email", bind=True, max_retries=3)
def send_order_sender_invoice_email(
    self,
    email: Optional[str] = None,
    order_number: Optional[str] = None,
    order_data: Optional[dict] = None,
    **kwargs,
) -> None:
    """Send an order invoice slip to the pickup/sender email address."""
    email_value = email or kwargs.get("email") or ""
    order_number_value = order_number or kwargs.get("order_number") or ""
    order_data_value = order_data or kwargs.get("order_data") or {}
    try:
        html = build_order_invoice_message(order_data_value)
        pdf = build_order_invoice_pdf(order_data_value)
        subject = f"Dispatch Delivery Invoice - Order #{order_number_value}"
        send_email_sync(
            email_value,
            subject,
            html,
            attachments=[
                {
                    "filename": f"invoice-{order_number_value}.pdf",
                    "content": pdf,
                    "content_type": "application/pdf",
                }
            ],
        )
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_order_recipient_notification_email", bind=True, max_retries=3)
def send_order_recipient_notification_email(
    self,
    email: Optional[str] = None,
    order_number: Optional[str] = None,
    order_data: Optional[dict] = None,
    tracking_url: Optional[str] = None,
    **kwargs,
) -> None:
    """Notify the recipient of an incoming order, with full order details
    and a link to track the delivery."""
    email_value = email or kwargs.get("email") or ""
    order_number_value = order_number or kwargs.get("order_number") or ""
    order_data_value = order_data or kwargs.get("order_data") or {}
    tracking_url_value = tracking_url or kwargs.get("tracking_url") or ""
    try:
        html = build_order_recipient_email(order_data_value, tracking_url_value)
        subject = f"A Delivery Is On Its Way - Order #{order_number_value}"
        send_email_sync(email_value, subject, html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_order_delivered_email", bind=True, max_retries=3)
def send_order_delivered_email(
    self,
    email: Optional[str] = None,
    order_number: Optional[str] = None,
    order_data: Optional[dict] = None,
    pod_attachments: Optional[list[dict[str, Any]]] = None,
    **kwargs,
) -> None:
    """Notify the sender that an order was delivered, attaching proof of
    delivery when it was required, otherwise the order details."""
    email_value = email or kwargs.get("email") or ""
    order_number_value = order_number or kwargs.get("order_number") or ""
    order_data_value = order_data or kwargs.get("order_data") or {}
    pod_attachments_value = pod_attachments or kwargs.get("pod_attachments") or []
    try:
        html = build_order_delivered_email(order_data_value, pod_included=bool(pod_attachments_value))
        subject = f"Order #{order_number_value} Delivered"

        if pod_attachments_value:
            attachments = [
                {
                    "filename": pod_attachment["filename"],
                    "content": base64.b64decode(pod_attachment["content_b64"]),
                    "content_type": pod_attachment.get("content_type", "application/octet-stream"),
                }
                for pod_attachment in pod_attachments_value
            ]
        else:
            attachments = [
                {
                    "filename": f"order-details-{order_number_value}.pdf",
                    "content": build_order_invoice_pdf(order_data_value),
                    "content_type": "application/pdf",
                }
            ]

        send_email_sync(email_value, subject, html, attachments=attachments)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="flush_driver_location_logs")
def flush_driver_location_logs() -> int:
    """Flush buffered driver location records from Redis into TimescaleDB."""
    import asyncio
    import logging
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.core.config import settings
    from app.services.driver_location_flush_service import DriverLocationFlushService

    logger = logging.getLogger(__name__)

    async def _flush() -> int:
        local_engine = create_async_engine(settings.database_url, echo=False)
        local_session_factory = async_sessionmaker(local_engine, expire_on_commit=False, class_=AsyncSession)
        redis_client = aioredis.from_url(settings.redis_url)
        try:
            async with local_session_factory() as session:
                flush_service = DriverLocationFlushService(redis_client)
                count = await flush_service.flush_buffer(session)
                if count > 0:
                    msg = f"[PERIODIC FLUSH] Periodic flush (interval: {settings.driver_location_flush_interval_seconds}s) completed: saved {count} record(s) to TimescaleDB."
                    logger.info(msg)
                return count
        finally:
            await redis_client.aclose()
            await local_engine.dispose()

    return asyncio.run(_flush())


