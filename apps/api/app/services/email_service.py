"""
Email sending via aiosmtplib (SMTP).
Used by Celery tasks (synchronous wrapper) and for direct sends.
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def send_email_sync(to: str, subject: str, html_body: str) -> None:
    """Send email synchronously (called from Celery worker)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.mail_host, settings.mail_port) as server:
        if settings.mail_starttls:
            server.starttls()
        if settings.mail_username:
            server.login(settings.mail_username, settings.mail_password)
        server.sendmail(settings.mail_from, to, msg.as_string())


def build_invitation_email(name: str, tenant_name: str, accept_url: str, role: str) -> str:
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>You've been invited to Dispatch Engine</h2>
        <p>Hi {name},</p>
        <p>You have been invited to  Dispatch Engine as a <strong>{role}</strong>.</p>
        <p>Click the link below to accept your invitation and set your password:</p>
        <p>
            <a href="{accept_url}"
               style="background: #2563eb; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation
            </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
            This link expires in 72 hours. If you did not expect this invitation, please ignore it.
        </p>
    </body>
    </html>
    """


def build_onboarding_submitted_email(tenant_name: str, contact_email: str) -> str:
    """Email sent when onboarding application is submitted."""
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Application Under Review</h2>
        <p>Hi {tenant_name},</p>
        <p>Thank you for submitting your application to join Dispatch Engine.</p>
        <p>Your application is currently under review. We will review your submission and get back to you within <strong>1-2 working days</strong>.</p>
        <p>You will receive an email notification once your application has been reviewed.</p>
        <p>If you have any questions, please contact us at support@dispatch.local</p>
        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


def build_onboarding_approved_email(tenant_name: str, tenant_role: str) -> str:
    """Email sent when onboarding application is approved."""
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">Application Approved ✓</h2>
        <p>Hi {tenant_name},</p>
        <p>Great news! Your application has been <strong>approved</strong>.</p>
        <p>Your account as a <strong>{tenant_role}</strong> is now active and ready to use.</p>
        <p>You can now log in to Dispatch Engine and start using our services.</p>
        <p>If you have any questions or need assistance, please contact our support team.</p>
        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


def build_onboarding_rejected_email(tenant_name: str, reason: str | None = None) -> str:
    """Email sent when onboarding application is rejected."""
    reason_text = f"<p><strong>Reason:</strong> {reason}</p>" if reason else ""
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Application Status Update</h2>
        <p>Hi {tenant_name},</p>
        <p>Thank you for your interest in joining Dispatch Engine. Unfortunately, your application has been <strong>rejected</strong>.</p>
        {reason_text}
        <p>Please contact our support team for more information or to discuss the next steps.</p>
        <p><strong>Support Email:</strong> support@dispatch.local</p>
        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


def build_tenant_suspended_email(tenant_name: str) -> str:
    """Email sent when a tenant account is suspended."""
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Account Suspended</h2>
        <p>Hi {tenant_name},</p>
        <p>Your account on Dispatch Engine has been <strong>suspended</strong>.</p>
        <p>Please contact the platform administrator for more information or to discuss the next steps.</p>
        <p><strong>Support Email:</strong> support@dispatch.local</p>
        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


def build_tenant_unsuspended_email(tenant_name: str) -> str:
    """Email sent when a tenant account suspension is removed."""
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">Account Reactivated</h2>
        <p>Hi {tenant_name},</p>
        <p>Your Dispatch Engine account suspension has been removed and your account is now <strong>active</strong>.</p>
        <p>You can log in and continue using the platform.</p>
        <p><strong>Support Email:</strong> support@dispatch.local</p>
        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


