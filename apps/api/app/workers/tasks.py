from app.workers.celery_app import celery_app
from app.services.email_service import (
    send_email_sync,
    build_invitation_email,
    build_onboarding_submitted_email,
    build_onboarding_approved_email,
    build_onboarding_rejected_email,
    build_tenant_suspended_email,
)


@celery_app.task(name="send_invitation_email", bind=True, max_retries=3)
def send_invitation_email(
    self,
    email: str = None,
    name: str = None,
    tenant_name: str = None,
    invite_token: str = None,
    accept_url: str = None,
    role: str = "member",
    **kwargs,
) -> None:
    email = email or kwargs.get("email")
    name = name or kwargs.get("name")
    tenant_name = tenant_name or kwargs.get("tenant_name")
    invite_token = invite_token or kwargs.get("invite_token")
    accept_url = accept_url or kwargs.get("accept_url")
    role = role or kwargs.get("role", "member")
    try:
        html = build_invitation_email(name, tenant_name, accept_url, role)
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
    tenant_name: str = None,
    contact_email: str = None,
    **kwargs,
) -> None:
    """Send email when onboarding application is submitted."""
    tenant_name = tenant_name or kwargs.get("tenant_name")
    contact_email = contact_email or kwargs.get("contact_email")
    try:
        html = build_onboarding_submitted_email(tenant_name, contact_email)
        send_email_sync(contact_email, "Your Application is Under Review", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_onboarding_approved_email", bind=True, max_retries=3)
def send_onboarding_approved_email(
    self,
    tenant_name: str = None,
    contact_email: str = None,
    tenant_role: str = None,
    **kwargs,
) -> None:
    """Send email when onboarding application is approved."""
    tenant_name = tenant_name or kwargs.get("tenant_name")
    contact_email = contact_email or kwargs.get("contact_email")
    tenant_role = tenant_role or kwargs.get("tenant_role") or kwargs.get("role")
    try:
        html = build_onboarding_approved_email(tenant_name, tenant_role)
        send_email_sync(contact_email, "Welcome! Your Application is Approved", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_onboarding_rejected_email", bind=True, max_retries=3)
def send_onboarding_rejected_email(
    self,
    tenant_name: str = None,
    contact_email: str = None,
    reason: str = None,
    **kwargs,
) -> None:
    """Send email when onboarding application is rejected."""
    tenant_name = tenant_name or kwargs.get("tenant_name")
    contact_email = contact_email or kwargs.get("contact_email")
    reason = reason or kwargs.get("reason")
    try:
        html = build_onboarding_rejected_email(tenant_name, reason)
        send_email_sync(contact_email, "Application Status Update", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_tenant_suspended_email", bind=True, max_retries=3)
def send_tenant_suspended_email(
    self,
    tenant_name: str = None,
    contact_email: str = None,
    **kwargs,
) -> None:
    """Send email when a tenant account is suspended."""
    tenant_name = tenant_name or kwargs.get("tenant_name")
    contact_email = contact_email or kwargs.get("contact_email")
    try:
        html = build_tenant_suspended_email(tenant_name)
        send_email_sync(contact_email, "Account Suspended", html)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)

