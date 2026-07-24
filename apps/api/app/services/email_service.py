"""
Email sending via aiosmtplib (SMTP).
Used by Celery tasks (synchronous wrapper) and for direct sends.
"""
from __future__ import annotations
from app.core.config import settings
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from html import escape
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def send_email_sync(
    to: str,
    subject: str,
    html_body: str,
    attachments: list[dict[str, Any]] | None = None,
) -> None:
    """Send email synchronously (called from Celery worker)."""
    attachments = attachments or []
    msg = MIMEMultipart("mixed") if attachments else MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.mail_from
    msg["To"] = to

    if attachments:
        body = MIMEMultipart("alternative")
        body.attach(MIMEText(html_body, "html"))
        msg.attach(body)
    else:
        msg.attach(MIMEText(html_body, "html"))

    for attachment in attachments:
        content = attachment["content"]
        content_type = attachment.get("content_type", "application/octet-stream")
        subtype = content_type.split("/", 1)[1] if "/" in content_type else "octet-stream"
        part = MIMEApplication(content, _subtype=subtype)
        part.add_header(
            "Content-Disposition",
            "attachment",
            filename=attachment["filename"],
        )
        msg.attach(part)

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


def build_tenant_suspended_email(tenant_name: str, reason: str | None = None) -> str:
    """Email sent when a tenant account is suspended."""
    reason_text = f"<p><strong>Reason for suspension:</strong> {reason}</p>" if reason else ""
    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Account Suspended</h2>
        <p>Hi {tenant_name},</p>
        <p>Your account on Dispatch Engine has been <strong>suspended</strong>.</p>
        {reason_text}
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

def build_order_delivered_email(order: Any, pod_included: bool) -> str:
    """Email sent to the sender when an order has been marked delivered."""
    order_number = _html(_field(order, "order_number"))
    pickup_name = _html(_field(order, "pickup_name")) or "there"
    delivery_name = _html(_field(order, "delivery_name")) or "—"
    delivery_address = _html(_field(order, "delivery_address"))
    total = _html(_money(_field(order, "total")))
    recipient_name = _html(_field(order, "pod_recipient_name"))

    if pod_included:
        proof_note = "Your proof of delivery is attached to this email."
    else:
        proof_note = "This order did not require proof of delivery. Order details are attached for your records."

    recipient_line = (
        f'<p>Received and signed for by <strong>{recipient_name}</strong>.</p>'
        if recipient_name
        else ""
    )

    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
        <p style="color: #94a3b8; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px;">
            DISPATCH DELIVERY
        </p>
        <h2 style="color: #10b981; margin: 0 0 4px;">Order #{order_number} Delivered</h2>

        <p>Hi {pickup_name},</p>
        <p>Your order has been successfully delivered to <strong>{delivery_name}</strong> at {delivery_address}.</p>
        {recipient_line}
        <p>{proof_note}</p>

        <p style="margin: 20px 0 0;">
            Total &nbsp;
            <strong style="color: #D97706; font-size: 18px;">{total}</strong>
        </p>

        <p style="margin-top: 24px;">Thank you for shipping with us.<br/>Dispatch Delivery</p>

        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


##Invoice Styling
INK = colors.HexColor("#111827")
SLATE = colors.HexColor("#475569")
FOG = colors.HexColor("#94A3B8")
HAIRLINE = colors.HexColor("#E5E7EB")
PAPER = colors.HexColor("#F8FAFC")
AMBER = colors.HexColor("#D97706")
AMBER_SOFT = colors.HexColor("#FEF3E2")
ALERT = colors.HexColor("#DC2626")
WHITE = colors.white

PAGE_MARGIN = 18 * mm
CONTENT_WIDTH = A4[0] - 2 * PAGE_MARGIN


def _html(value: Any) -> str:
    return escape(str(value or ""), quote=True)


def _field(source: Any, name: str, default: Any = "") -> Any:
    if isinstance(source, dict):
        return source.get(name, default)
    return getattr(source, name, default)


def _money(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0
    return f"C$ {amount:,.2f}"


def _format_order_status(value: Any) -> str:
    raw = getattr(value, "value", value)
    return str(raw or "").replace("_", " ").title()


def _format_payment_method(value: Any) -> str:
    raw = str(value or "").replace("_", " ").strip()
    return raw.title() if raw else ""


def _mask_card(card_number: Any) -> str:
    digits = "".join(ch for ch in str(card_number or "") if ch.isdigit())
    if len(digits) < 4:
        return ""
    return f"**** **** **** {digits[-4:]}"


def _tracked(text: str, gap: str = " ") -> str:
    """Letter-space short uppercase strings for the eyebrow / wordmark treatment."""
    return gap.join(list(text.upper()))


STATUS_COLORS = {
    "delivered": (colors.HexColor("#ECFDF5"), colors.HexColor("#047857")),
    "cancelled": (colors.HexColor("#FEF2F2"), colors.HexColor("#B91C1C")),
    "declined": (colors.HexColor("#FEF2F2"), colors.HexColor("#B91C1C")),
}


def _status_colors(raw_status: str) -> tuple:
    key = str(raw_status or "").lower().replace(" ", "_")
    return STATUS_COLORS.get(key, (AMBER_SOFT, AMBER))


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

_styles = getSampleStyleSheet()

BODY = ParagraphStyle(
    "InvoiceBody", parent=_styles["BodyText"],
    fontName="Helvetica", fontSize=9, leading=13, textColor=SLATE,
)
BODY_BOLD = ParagraphStyle(
    "InvoiceBodyBold", parent=BODY, fontName="Helvetica-Bold", textColor=INK,
)
MUTED = ParagraphStyle(
    "InvoiceMuted", parent=BODY, fontSize=8, textColor=FOG,
)
RIGHT_MUTED = ParagraphStyle(
    "InvoiceRightMuted", parent=MUTED, alignment=2,
)
EYEBROW = ParagraphStyle(
    "InvoiceEyebrow", parent=BODY,
    fontName="Helvetica-Bold", fontSize=7.5, leading=10,
    textColor=FOG, spaceAfter=7,
)
ORDER_TITLE = ParagraphStyle(
    "InvoiceOrderTitle", parent=_styles["Title"],
    fontName="Times-Bold", fontSize=22, leading=24, alignment=0, textColor=INK,
)
WORDMARK = ParagraphStyle(
    "InvoiceWordmark", parent=BODY,
    fontName="Times-Bold", fontSize=12, leading=14, alignment=2, textColor=INK,
)
TAGLINE = ParagraphStyle(
    "InvoiceTagline", parent=RIGHT_MUTED, fontSize=7,
)
TABLE_HEAD = ParagraphStyle(
    "InvoiceTableHead", parent=BODY,
    fontName="Helvetica-Bold", fontSize=7.5, textColor=FOG,
)
CELL = ParagraphStyle(
    "InvoiceCell", parent=BODY, fontSize=9,
)
CELL_RIGHT = ParagraphStyle(
    "InvoiceCellRight", parent=CELL, alignment=2,
)
TOTAL_LABEL = ParagraphStyle(
    "InvoiceTotalLabel", parent=BODY_BOLD, fontSize=12,
)
TOTAL_VALUE = ParagraphStyle(
    "InvoiceTotalValue", parent=TOTAL_LABEL, alignment=2, textColor=AMBER,
)
STATUS_TEXT = ParagraphStyle(
    "InvoiceStatusText", parent=BODY,
    fontName="Helvetica-Bold", fontSize=8, alignment=1,
)


def _p(value: Any, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(_html(value), style)


# ---------------------------------------------------------------------------
# Signature element: the route line
# ---------------------------------------------------------------------------

class RouteLine(Flowable):
    """Two dots — Pickup, Delivery — joined by a dashed line.
    """

    def __init__(self, width: float, height: float = 13 * mm):
        super().__init__()
        self.width = width
        self.height = height

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        c = self.canv
        y = self.height * 0.62
        left_x = 2 * mm
        right_x = self.width - 2 * mm
        radius = 2.6

        c.setStrokeColor(AMBER)
        c.setLineWidth(1)
        c.setDash(2, 2)
        c.line(left_x + radius + 3, y, right_x - radius - 3, y)
        c.setDash()

        c.setFillColor(AMBER)
        c.circle(left_x, y, radius, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setStrokeColor(AMBER)
        c.setLineWidth(1.4)
        c.circle(right_x, y, radius, stroke=1, fill=1)
        c.setFillColor(AMBER)
        c.circle(right_x, y, radius * 0.4, stroke=0, fill=1)

        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(INK)
        c.drawString(left_x - 1, y - 10, _tracked("Pickup", ""))
        c.drawRightString(right_x + 1, y - 10, _tracked("Delivery", ""))


class RoundedTag(Flowable):
    """Status pill — rounded rect, filled by state color."""

    def __init__(self, text: str, fill: colors.Color, text_color: colors.Color,
                 width: float = 30 * mm, height: float = 6.4 * mm):
        super().__init__()
        self.text = text
        self.fill = fill
        self.text_color = text_color
        self.width = width
        self.height = height

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(self.fill)
        c.roundRect(0, 0, self.width, self.height, self.height / 2, stroke=0, fill=1)
        c.setFillColor(self.text_color)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(self.width / 2, self.height / 2 - 2.6, self.text.upper())


# ---------------------------------------------------------------------------
# Message body (HTML email)
# ---------------------------------------------------------------------------

def build_order_invoice_message(order: Any) -> str:
    """Email sent to the sender alongside the order invoice PDF."""
    order_number = _html(_field(order, "order_number"))
    pickup_name = _html(_field(order, "pickup_name")) or "there"
    pickup_city = _html(_field(order, "pickup_address"))
    delivery_name = _html(_field(order, "delivery_name")) or "—"
    delivery_city = _html(_field(order, "delivery_address"))
    total = _html(_money(_field(order, "total")))
    status = _html(_format_order_status(_field(order, "status")) or "Pending")

    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
        <p style="color: #94a3b8; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px;">
            DISPATCH DELIVERY
        </p>
        <h2 style="color: #D97706; margin: 0 0 4px;">Invoice for Order #{order_number}</h2>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 20px;">Status: {status}</p>

        <p>Hi {pickup_name},</p>
        <p>Your invoice for <strong>Order #{order_number}</strong> is attached as a PDF. Here's a quick summary:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
                <td style="border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 14px 0;">
                    <table style="width: 100%;">
                        <tr>
                            <td style="color: #94a3b8; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">PICKUP</td>
                            <td style="color: #94a3b8; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; text-align: right;">DELIVERY</td>
                        </tr>
                        <tr>
                            <td style="color: #111827; font-weight: bold; padding-top: 4px;">{pickup_name}</td>
                            <td style="color: #111827; font-weight: bold; padding-top: 4px; text-align: right;">{delivery_name}</td>
                        </tr>
                        <tr>
                            <td style="color: #475569; font-size: 13px;">{pickup_city}</td>
                            <td style="color: #475569; font-size: 13px; text-align: right;">{delivery_city}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <p style="margin: 0;">
            Total &nbsp;
            <strong style="color: #D97706; font-size: 18px;">{total}</strong>
        </p>

        <p style="margin-top: 24px;">Thank you for shipping with us.<br/>Dispatch Delivery</p>

        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


def build_order_recipient_email(order: Any, tracking_url: str) -> str:
    """Email sent to the recipient with full order/sender/receiver details,
    an itemized breakdown, and a link to track the delivery."""
    order_number = _html(_field(order, "order_number"))
    delivery_name = _html(_field(order, "delivery_name")) or "there"
    delivery_phone = _html(_field(order, "delivery_phone"))
    delivery_email = _html(_field(order, "delivery_email"))
    delivery_address = _html(_field(order, "delivery_address"))
    delivery_date = _html(_field(order, "delivery_date"))
    delivery_time = _html(_field(order, "delivery_time"))

    pickup_name = _html(_field(order, "pickup_name")) or "—"
    pickup_phone = _html(_field(order, "pickup_phone"))
    pickup_email = _html(_field(order, "pickup_email"))
    pickup_address = _html(_field(order, "pickup_address"))

    status = _html(_format_order_status(_field(order, "status")) or "Pending")
    tracking_url_safe = _html(tracking_url)

    items = _field(order, "items", []) or []
    item_rows = "".join(
        f"""
        <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">{_html(_field(item, 'itemName'))}</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: center; color: #475569;">{_html(_field(item, 'itemQty'))}</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">{_html(_money(_field(item, 'itemPrice')))}</td>
        </tr>
        """
        for item in items
    )

    discount_val = _field(order, "discount")
    try:
        has_discount = float(discount_val or 0) > 0
    except (TypeError, ValueError):
        has_discount = False
    discount_row = (
        f"""
        <tr>
            <td style="padding: 4px 0; color: #6b7280;">Discount</td>
            <td style="padding: 4px 0; text-align: right; color: #DC2626;">-{_html(_money(discount_val))}</td>
        </tr>
        """
        if has_discount
        else ""
    )

    return f"""
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
        <p style="color: #94a3b8; font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 0 0 4px;">
            DISPATCH DELIVERY
        </p>
        <h2 style="color: #D97706; margin: 0 0 4px;">A Delivery Is On Its Way - Order #{order_number}</h2>
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 20px;">Status: {status}</p>

        <p>Hi {delivery_name},</p>
        <p>An order has been sent to you. Here are the full details:</p>

        <p style="margin: 24px 0;">
            <a href="{tracking_url_safe}"
               style="background: #D97706; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; display: inline-block;">
                Track Your Delivery
            </a>
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
                <td style="border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 14px 0;">
                    <table style="width: 100%;">
                        <tr>
                            <td style="color: #94a3b8; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">FROM (SENDER)</td>
                            <td style="color: #94a3b8; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; text-align: right;">TO (YOU)</td>
                        </tr>
                        <tr>
                            <td style="color: #111827; font-weight: bold; padding-top: 4px;">{pickup_name}</td>
                            <td style="color: #111827; font-weight: bold; padding-top: 4px; text-align: right;">{delivery_name}</td>
                        </tr>
                        <tr>
                            <td style="color: #475569; font-size: 13px;">{pickup_phone}</td>
                            <td style="color: #475569; font-size: 13px; text-align: right;">{delivery_phone}</td>
                        </tr>
                        <tr>
                            <td style="color: #475569; font-size: 13px;">{pickup_email}</td>
                            <td style="color: #475569; font-size: 13px; text-align: right;">{delivery_email}</td>
                        </tr>
                        <tr>
                            <td style="color: #475569; font-size: 13px; padding-top: 4px;">{pickup_address}</td>
                            <td style="color: #475569; font-size: 13px; text-align: right; padding-top: 4px;">{delivery_address}</td>
                        </tr>
                        <tr>
                            <td></td>
                            <td style="color: #6b7280; font-size: 12px; text-align: right; padding-top: 4px;">{delivery_date} &nbsp;·&nbsp; {delivery_time}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <p style="color: #94a3b8; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; margin: 20px 0 8px;">ITEMS</p>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="color: #94a3b8; font-size: 11px; font-weight: bold; padding-bottom: 6px; border-bottom: 1px solid #111827;">ITEM</td>
                <td style="color: #94a3b8; font-size: 11px; font-weight: bold; padding-bottom: 6px; border-bottom: 1px solid #111827; text-align: center;">QTY</td>
                <td style="color: #94a3b8; font-size: 11px; font-weight: bold; padding-bottom: 6px; border-bottom: 1px solid #111827; text-align: right;">PRICE</td>
            </tr>
            {item_rows}
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-top: 14px;">
            <tr>
                <td style="padding: 4px 0; color: #6b7280;">Subtotal</td>
                <td style="padding: 4px 0; text-align: right;">{_html(_money(_field(order, 'subtotal')))}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #6b7280;">Tax ({_html(_field(order, 'tax_rate'))}%)</td>
                <td style="padding: 4px 0; text-align: right;">{_html(_money(_field(order, 'tax_amount')))}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #6b7280;">Delivery fees</td>
                <td style="padding: 4px 0; text-align: right;">{_html(_money(_field(order, 'delivery_fees')))}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #6b7280;">Tips</td>
                <td style="padding: 4px 0; text-align: right;">{_html(_money(_field(order, 'delivery_tips')))}</td>
            </tr>
            {discount_row}
            <tr>
                <td style="padding: 10px 0 0; font-weight: bold; font-size: 16px; border-top: 1.5px solid #D97706;">Total</td>
                <td style="padding: 10px 0 0; font-weight: bold; font-size: 16px; text-align: right; color: #D97706; border-top: 1.5px solid #D97706;">{_html(_money(_field(order, 'total')))}</td>
            </tr>
        </table>

        <p style="margin-top: 24px;">Thank you for using Dispatch Delivery.<br/>Dispatch Delivery</p>

        <br/>
        <p style="color: #6b7280; font-size: 14px;">
            This is an automated message. Please do not reply directly to this email.
        </p>
    </body>
    </html>
    """


# ---------------------------------------------------------------------------
# PDF body
# ---------------------------------------------------------------------------

def build_order_invoice_pdf(order: Any) -> bytes:
    """Build an order invoice PDF attachment from an Order model or dict."""

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=PAGE_MARGIN,
        leftMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
        title=f"Invoice {_field(order, 'order_number', '')}",
    )

    order_number = _field(order, "order_number")
    status_raw = _format_order_status(_field(order, "status"))
    payment_details = _field(order, "payment_details", {}) or {}
    credit_card = _field(payment_details, "creditCard", {}) or {}
    masked_card = _mask_card(_field(credit_card, "cardNumber", ""))
    status_fill, status_ink = _status_colors(status_raw)

    story: list[Any] = []

    # --- Header: order number + status  |  wordmark + placed date --------
    header = Table(
        [[
            [
                Paragraph(f"Order #{_html(order_number)}", ORDER_TITLE),
                Spacer(1, 4),
                RoundedTag(status_raw or "Pending", status_fill, status_ink),
            ],
            [
                Paragraph(_tracked("Dispatch Delivery"), WORDMARK),
                Paragraph("Courier & Parcel Invoice", TAGLINE),
                Spacer(1, 6),
                Paragraph(
                    f"Placed &nbsp; {_html(_field(order, 'order_placed_time'))}",
                    RIGHT_MUTED,
                ),
            ],
        ]],
        colWidths=[CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.45],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 10))
    story.append(RouteLine(CONTENT_WIDTH))
    story.append(Spacer(1, 4))

    rule = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[0.1])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.75, HAIRLINE)]))
    story.append(rule)
    story.append(Spacer(1, 14))

    # --- Pickup / Delivery ------------------------------------------------
    pickup_block = [
        Paragraph(_tracked("Pickup", ""), EYEBROW),
        Paragraph(_html(_field(order, "pickup_name")), BODY_BOLD),
        _p(_field(order, "pickup_phone")),
        _p(_field(order, "pickup_email")),
        _p(_field(order, "pickup_address")),
        Spacer(1, 4),
        Paragraph(
            f"{_html(_field(order, 'pickup_date'))} &nbsp;·&nbsp; "
            f"{_html(_field(order, 'pickup_time'))}",
            MUTED,
        ),
    ]
    delivery_block = [
        Paragraph(_tracked("Delivery", ""), EYEBROW),
        Paragraph(_html(_field(order, "delivery_name")), BODY_BOLD),
        _p(_field(order, "delivery_phone")),
        _p(_field(order, "delivery_email")),
        _p(_field(order, "delivery_address")),
        Spacer(1, 4),
        Paragraph(
            f"{_html(_field(order, 'delivery_date'))} &nbsp;·&nbsp; "
            f"{_html(_field(order, 'delivery_time'))}",
            MUTED,
        ),
    ]
    info = Table(
        [[pickup_block, "", delivery_block]],
        colWidths=[CONTENT_WIDTH * 0.46, CONTENT_WIDTH * 0.08, CONTENT_WIDTH * 0.46],
    )
    info.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEAFTER", (0, 0), (0, 0), 0.75, HAIRLINE),
    ]))
    story.append(info)
    story.append(Spacer(1, 18))

    # --- Items --------------------------------------------------------
    story.append(Paragraph(_tracked("Items", ""), EYEBROW))

    header_row = [
        Paragraph("ITEM", TABLE_HEAD),
        Paragraph("QTY", ParagraphStyle("h", parent=TABLE_HEAD, alignment=2)),
        Paragraph("PRICE", ParagraphStyle("h", parent=TABLE_HEAD, alignment=2)),
    ]
    item_rows = [header_row]
    items = _field(order, "items", []) or []
    for item in items:
        item_rows.append([
            Paragraph(_html(_field(item, "itemName")), CELL),
            Paragraph(_html(_field(item, "itemQty")), CELL_RIGHT),
            Paragraph(_html(_money(_field(item, "itemPrice"))), CELL_RIGHT),
        ])

    items_table = Table(item_rows, colWidths=[104 * mm, 22 * mm, 34 * mm])
    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_idx in range(1, len(item_rows)):
        if row_idx % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), PAPER))
    items_table.setStyle(TableStyle(style_cmds))
    story.append(items_table)
    story.append(Spacer(1, 4))
    close_rule = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[0.1])
    close_rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 0.75, HAIRLINE)]))
    story.append(close_rule)
    story.append(Spacer(1, 16))

    # --- Totals -------------------------------------------------------
    line_items = [
        ("Subtotal", _money(_field(order, "subtotal")), False),
        (f"Tax ({_field(order, 'tax_rate')}%)", _money(_field(order, "tax_amount")), False),
        ("Delivery fees", _money(_field(order, "delivery_fees")), False),
        ("Tips", _money(_field(order, "delivery_tips")), False),
    ]
    discount_val = _field(order, "discount")
    rows = []
    for label, value, _ in line_items:
        rows.append([_p(label, MUTED), Paragraph(_html(value), RIGHT_MUTED)])
    try:
        has_discount = float(discount_val or 0) > 0
    except (TypeError, ValueError):
        has_discount = False
    if has_discount:
        rows.append([
            _p("Discount", MUTED),
            Paragraph(
                f"-{_html(_money(discount_val))}",
                ParagraphStyle("disc", parent=RIGHT_MUTED, textColor=ALERT),
            ),
        ])
    rows.append([
        Paragraph("Total", TOTAL_LABEL),
        Paragraph(_html(_money(_field(order, "total"))), TOTAL_VALUE),
    ])

    totals_table = Table(rows, colWidths=[CONTENT_WIDTH - 60 * mm, 60 * mm])
    totals_style = [
        ("TOPPADDING", (0, 0), (-1, -2), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 3),
        ("TOPPADDING", (0, -1), (-1, -1), 10),
        ("LINEABOVE", (0, -1), (-1, -1), 1.4, AMBER),
    ]
    totals_table.setStyle(TableStyle(totals_style))
    story.append(totals_table)
    story.append(Spacer(1, 20))

    # --- Payment footer -------------------------------------------------
    payment_bits = [f"Paid via {_format_payment_method(_field(order, 'payment_method'))}"]
    if masked_card:
        payment_bits.append(masked_card)
    footer_rule = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[0.1])
    footer_rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 0.75, HAIRLINE)]))
    story.append(footer_rule)
    story.append(Spacer(1, 8))
    footer = Table(
        [[
            Paragraph(_html("  ·  ".join(payment_bits)), MUTED),
            Paragraph(_tracked(" ", ""), RIGHT_MUTED),
        ]],
        colWidths=[CONTENT_WIDTH * 0.7, CONTENT_WIDTH * 0.3],
    )
    footer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(footer)

    doc.build(story)
    return buffer.getvalue()



