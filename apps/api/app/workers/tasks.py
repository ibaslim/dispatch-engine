from app.workers.celery_app import celery_app
from app.services.email_service import (
    send_email_sync,
    build_invitation_email,
    build_onboarding_submitted_email,
    build_onboarding_approved_email,
    build_onboarding_rejected_email,
)


@celery_app.task(name="send_invitation_email", bind=True, max_retries=3)
def send_invitation_email(
    self,
    email: str,
    name: str,
    tenant_name: str,
    invite_token: str,
    accept_url: str,
) -> None:
    try:
        html = build_invitation_email(name, tenant_name, accept_url)
        send_email_sync(email, "You're invited to Dispatch Engine", html)
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


@celery_app.task(name="send_push_notification")
def send_push_notification(fcm_token: str, title: str, body: str, data: dict | None = None) -> None:
    """Send push notification via FCM HTTP v1 API. Stub for now."""
    # TODO: Implement using firebase-admin SDK
    pass


@celery_app.task(name="send_onboarding_submitted_email", bind=True, max_retries=3)
def send_onboarding_submitted_email(
    self,
    tenant_name: str,
    contact_email: str,
) -> None:
    """Send email when onboarding application is submitted."""
    try:
        html = build_onboarding_submitted_email(tenant_name, contact_email)
        send_email_sync(contact_email, "Your Application is Under Review", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_onboarding_approved_email", bind=True, max_retries=3)
def send_onboarding_approved_email(
    self,
    tenant_name: str,
    contact_email: str,
    tenant_role: str,
) -> None:
    """Send email when onboarding application is approved."""
    try:
        html = build_onboarding_approved_email(tenant_name, tenant_role)
        send_email_sync(contact_email, "Welcome! Your Application is Approved", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_onboarding_rejected_email", bind=True, max_retries=3)
def send_onboarding_rejected_email(
    self,
    tenant_name: str,
    contact_email: str,
    reason: str | None = None,
) -> None:
    """Send email when onboarding application is rejected."""
    try:
        html = build_onboarding_rejected_email(tenant_name, reason)
        send_email_sync(contact_email, "Application Status Update", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)

