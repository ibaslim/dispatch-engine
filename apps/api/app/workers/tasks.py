from app.workers.celery_app import celery_app
from app.services.email_service import (
    send_email_sync,
    build_invitation_email,
    build_onboarding_submitted_email,
    build_onboarding_approved_email,
    build_onboarding_rejected_email,
    build_tenant_suspended_email,
    build_tenant_unsuspended_email,
)
from typing import Optional


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


@celery_app.task(name="send_push_notification")
def send_push_notification(fcm_token: str, title: str, body: str, data: dict | None = None) -> None:
    """Send push notification via FCM HTTP v1 API. Stub for now."""
    # TODO: Implement using firebase-admin SDK
    pass


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


