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


def build_invitation_email(name: str, tenant_name: str, accept_url: str) -> str:
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>You've been invited to Dispatch Engine</h2>
        <p>Hi {name},</p>
        <p>You have been invited to manage <strong>{tenant_name}</strong> on Dispatch Engine.</p>
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
