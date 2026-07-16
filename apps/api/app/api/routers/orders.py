import base64
import mimetypes
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.core.deps import CurrentUser
from app.models.order import Order, OrderStatus, ActivityStatus
from app.models.tenant import Tenant, TenantRole
from app.schemas.order import (
    OrderCreate,
    OrderResponse,
    OrderUpdate,
    ActivityStatusUpdate,
    IncidentReportCreate,
    IncidentReason,
    IncidentStage,
    INCIDENT_REASONS_REQUIRING_DESCRIPTION,
)
from app.workers.tasks import send_order_sender_invoice_email, send_order_delivered_email
from uuid import UUID, uuid4

router = APIRouter(tags=["Orders"])
APP_TIMEZONE = ZoneInfo("Asia/Karachi")
PUBLISH_WINDOW_MINUTES = 15

POD_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
POD_CHUNK_SIZE = 1024 * 1024  # 1 MB
POD_ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def parse_order_datetime(date_value: str, time_value: str) -> datetime:
    return datetime.strptime(f"{date_value} {time_value}", "%Y-%m-%d %H:%M").replace(
        tzinfo=APP_TIMEZONE
    )


def get_order_status(
    pickup_date: str,
    pickup_time: str,
    delivery_date: str,
    delivery_time: str,
):
    now = datetime.now(APP_TIMEZONE)

    try:
        delivery_at = parse_order_datetime(delivery_date, delivery_time)
        return (
            OrderStatus.current
            if delivery_at <= now + timedelta(hours=3)
            else OrderStatus.scheduled
        )
    except ValueError:
        pickup_at = datetime.strptime(pickup_time, "%H:%M")
        delivery_at = datetime.strptime(delivery_time, "%H:%M")
        diff_hours = (delivery_at - pickup_at).total_seconds() / 3600
        return OrderStatus.current if diff_hours < 3 else OrderStatus.scheduled


async def generate_order_number(db: AsyncSession) -> str:
    now = datetime.now(APP_TIMEZONE)
    day = now.strftime("%d")
    month = now.strftime("%m")
    year = now.strftime("%y")

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    result = await db.execute(
        select(func.count(Order.id)).where(
            (Order.created_at >= today_start) & (Order.created_at < today_end)
        )
    )
    count = result.scalar() or 0
    order_sequence = str(count + 1).zfill(2)

    return f"ORD{day}{month}{year}{order_sequence}"


# -------------------------
# GET ORDERS
# -------------------------
@router.get("", response_model=list[OrderResponse])
async def get_orders(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).options(selectinload(Order.driver))

    if not current_user.is_platform_admin and current_user.tenant_id:
        result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            if tenant.role == TenantRole.driver:
                query = query.where(Order.driver_id == current_user.tenant_id)
            elif tenant.role == TenantRole.vendor:
                # Also check pickup_name fallback just in case vendor_id isn't populated
                query = query.where(
                    (Order.vendor_id == current_user.tenant_id) |
                    (Order.pickup_name == tenant.name)
                )

    result = await db.execute(query)
    return result.scalars().all()


# -------------------------
# CREATE ORDER
# -------------------------
@router.post("", response_model=OrderResponse)
async def create_order(
    payload: OrderCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access for tenant users.",
        )
    try:
        data = payload.model_dump()

        data["order_number"] = await generate_order_number(db)
        data["order_placed_time"] = datetime.now(APP_TIMEZONE).strftime("%I:%M %p")
        proof = data.get("proof_of_delivery", {})
        if not proof.get("signature") and not proof.get("picture"):
            raise HTTPException(
                status_code=400,
                detail="At least one proof of delivery method is required."
            )
        data["proof_of_delivery"] = data.get("proof_of_delivery") or {
            "signature": False,
            "picture": False,
        }

        data["status"] = get_order_status(
            data["pickup_date"],
            data["pickup_time"],
            data["delivery_date"],
            data["delivery_time"],
        )

        order = Order(**data)
        db.add(order)
        await db.commit()
        await db.refresh(order)

        # Re-fetch with driver relationship loaded
        result = await db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.driver))
        )
        return result.scalar_one()

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Error creating order. Please try again."
        )


# -------------------------
# UPDATE ORDER
# -------------------------
@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    payload: OrderUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access for tenant users.",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.driver))
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Editing an order must not wipe an already-captured POD submission
    # (signature/photo paths written by the driver upload endpoints).
    if "proof_of_delivery" in update_data:
        existing_submission = (order.proof_of_delivery or {}).get("submission")
        incoming = dict(update_data["proof_of_delivery"] or {})
        if existing_submission and not incoming.get("submission"):
            incoming["submission"] = existing_submission
        update_data["proof_of_delivery"] = incoming

    try:
        for key, value in update_data.items():
            setattr(order, key, value)

        schedule_fields = {"pickup_date", "pickup_time", "delivery_date", "delivery_time"}
        if "status" not in update_data and schedule_fields.intersection(update_data):
            order.status = get_order_status(
                order.pickup_date,
                order.pickup_time,
                order.delivery_date,
                order.delivery_time,
            )

        await db.commit()
        await db.refresh(order)

        # Re-fetch with driver relationship loaded
        result = await db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.driver))
        )
        return result.scalar_one()

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Order number already exists. Please use a unique order number."
        )


# -------------------------
# DELETE ORDER
# -------------------------
@router.delete("/{order_id}")
async def delete_order(
    order_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access for tenant users.",
        )

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await db.delete(order)
    await db.commit()

    return {"success": True, "id": order_id}


# -------------------------
# STATUS UPDATE
# -------------------------
class StatusUpdate(BaseModel):
    status: OrderStatus


@router.patch("/{order_id}/status")
async def update_status(
    order_id: str,
    payload: StatusUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not current_user.is_platform_admin:
        # Check if the tenant owns the order
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if not tenant or (
            (tenant.role == TenantRole.driver and order.driver_id != tenant.id) and 
            (tenant.role == TenantRole.vendor and order.vendor_id != tenant.id and order.pickup_name != tenant.name)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to update this order's status.",
            )

    order.status = payload.status
    await db.commit()

    return {"success": True}


@router.patch("/{order_id}/activity-status")
async def update_activity_status(
    order_id: str,
    payload: ActivityStatusUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not current_user.is_platform_admin:
        # Only the assigned driver can update the activity status
        if not current_user.tenant_id or order.driver_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the assigned driver can update this order's activity status.",
            )

    previous_activity_status = order.activity_status
    order.activity_status = payload.activity_status

    is_new_delivery = (
        payload.activity_status == ActivityStatus.delivered
        and previous_activity_status != ActivityStatus.delivered
    )
    if is_new_delivery:
        order.status = OrderStatus.completed

    await db.commit()

    if is_new_delivery:
        _notify_sender_order_delivered(order)

    return {"success": True, "activity_status": order.activity_status, "status": order.status}


def _notify_sender_order_delivered(order: Order) -> None:
    pickup_email = (order.pickup_email or "").strip()
    if not pickup_email:
        return

    order_data = {
        "order_number": order.order_number,
        "status": order.status.value if order.status else "",
        "order_placed_time": order.order_placed_time,
        "pickup_name": order.pickup_name,
        "pickup_phone": order.pickup_phone,
        "pickup_email": order.pickup_email,
        "pickup_address": order.pickup_address,
        "pickup_date": order.pickup_date,
        "pickup_time": order.pickup_time,
        "delivery_name": order.delivery_name,
        "delivery_phone": order.delivery_phone,
        "delivery_email": order.delivery_email,
        "delivery_address": order.delivery_address,
        "delivery_date": order.delivery_date,
        "delivery_time": order.delivery_time,
        "items": order.items or [],
        "subtotal": order.subtotal,
        "tax_rate": order.tax_rate,
        "tax_amount": order.tax_amount,
        "delivery_fees": order.delivery_fees,
        "delivery_tips": order.delivery_tips,
        "discount": order.discount,
        "total": order.total,
        "payment_method": order.payment_method,
        "payment_details": order.payment_details or {},
    }

    proof = order.proof_of_delivery or {}
    pod_required = bool(proof.get("signature") or proof.get("picture"))
    pod_attachments: list[dict] = []
    submission = proof.get("submission") or {}
    order_data["pod_recipient_name"] = submission.get("recipient_name") or ""

    if pod_required:
        for pod_path in (submission.get("signature_path"), submission.get("photo_path")):
            if pod_path and Path(pod_path).is_file():
                pod_attachments.append({
                    "filename": Path(pod_path).name,
                    "content_b64": base64.b64encode(Path(pod_path).read_bytes()).decode("ascii"),
                    "content_type": mimetypes.guess_type(pod_path)[0] or "application/octet-stream",
                })

    send_order_delivered_email.delay(
        email=pickup_email,
        order_number=order.order_number,
        order_data=order_data,
        pod_attachments=pod_attachments,
    )


# -------------------------
# INCIDENT REPORTS (sender/recipient absent, etc.)
# -------------------------
PICKUP_INCIDENT_REASONS = {IncidentReason.no_answer, IncidentReason.wrong_address, IncidentReason.business_closed, IncidentReason.parcel_issue, IncidentReason.other}
DELIVERY_INCIDENT_REASONS = {IncidentReason.no_answer, IncidentReason.wrong_address, IncidentReason.refused, IncidentReason.other}

@router.post("/{order_id}/report")
async def report_incident(
    order_id: str,
    payload: IncidentReportCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not current_user.tenant_id or order.driver_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned driver can report the issue.",
        )

    if order.incident_report:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This order already has a reported issue.",
        )

    allowed_reasons = PICKUP_INCIDENT_REASONS if payload.stage == IncidentStage.pickup else DELIVERY_INCIDENT_REASONS
    if payload.reason not in allowed_reasons:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{payload.reason.value}' is not a valid reason for stage '{payload.stage.value}'.",
        )

    description = (payload.description or "").strip()
    if payload.reason in INCIDENT_REASONS_REQUIRING_DESCRIPTION and not description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A description is required when reason is '{payload.reason.value}'.",
        )

    order.incident_report = {
        "id": str(uuid4()),
        "stage": payload.stage.value,
        "reason": payload.reason.value,
        "description": description or None,
        "reported_by": str(current_user.tenant_id) if current_user.tenant_id else None,
        "reported_at": datetime.utcnow().isoformat(),
    }

    await db.commit()

    return {"success": True, "incident_report": order.incident_report}

# -------------------------
# PROOF OF DELIVERY UPLOADS
# -------------------------
def _authorize_pod_upload(order: Order, current_user: CurrentUser) -> None:
    if current_user.is_platform_admin:
        return
    if not current_user.tenant_id or order.driver_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned driver can submit proof of delivery.",
        )


def _safe_pod_filename_stem(value: str) -> str:
    stem = "".join(c for c in value if c.isalnum() or c in ("-", "_"))
    return stem or "delivery"


async def _save_pod_image(order_id: str, upload: UploadFile, filename_stem: str) -> str:
    content_type = (upload.content_type or "").lower().strip()
    extension = POD_ALLOWED_CONTENT_TYPES.get(content_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPG, PNG, or WebP images are allowed.",
        )

    upload_dir = Path(settings.uploads_dir) / "proof-of-delivery" / str(order_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_stem = _safe_pod_filename_stem(filename_stem)
    final_filepath = upload_dir / f"{safe_stem}{extension}"
    temp_filepath = upload_dir / f"{safe_stem}{extension}.part"

    total_size = 0

    try:
        with open(temp_filepath, "wb") as out_file:
            while chunk := await upload.read(POD_CHUNK_SIZE):
                total_size += len(chunk)

                if total_size > POD_MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File too large. Maximum allowed size is 10 MB.",
                    )

                out_file.write(chunk)

        os.replace(temp_filepath, final_filepath)

    except HTTPException:
        if temp_filepath.exists():
            temp_filepath.unlink()
        raise

    except Exception:
        if temp_filepath.exists():
            temp_filepath.unlink()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file.",
        )

    finally:
        await upload.close()

    return str(final_filepath)


@router.post("/{order_id}/proof-of-delivery/photo")
async def upload_proof_of_delivery_photo(
    order_id: str,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    _authorize_pod_upload(order, current_user)

    filepath = await _save_pod_image(order_id, file, order.order_number or order_id)

    proof = dict(order.proof_of_delivery or {})
    submission = dict(proof.get("submission") or {})
    submission["photo_path"] = filepath
    submission["photo_uploaded_at"] = datetime.utcnow().isoformat()
    proof["submission"] = submission
    order.proof_of_delivery = proof

    await db.commit()

    return {"success": True}


@router.post("/{order_id}/proof-of-delivery/signature")
async def upload_proof_of_delivery_signature(
    order_id: str,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    recipient_name: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    _authorize_pod_upload(order, current_user)

    if not recipient_name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recipient name is required.")

    filepath = await _save_pod_image(order_id, file, f"{order.order_number or order_id}-signature")

    proof = dict(order.proof_of_delivery or {})
    submission = dict(proof.get("submission") or {})
    submission["signature_path"] = filepath
    submission["recipient_name"] = recipient_name.strip()
    submission["signature_uploaded_at"] = datetime.utcnow().isoformat()
    proof["submission"] = submission
    order.proof_of_delivery = proof

    await db.commit()

    return {"success": True}


async def _authorize_pod_view(order: Order, current_user: CurrentUser, db: AsyncSession) -> None:
    """Mirrors the order visibility rules of get_orders."""
    if current_user.is_platform_admin:
        return
    if current_user.tenant_id:
        result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            if tenant.role == TenantRole.driver and order.driver_id == current_user.tenant_id:
                return
            if tenant.role == TenantRole.vendor and (
                order.vendor_id == current_user.tenant_id or order.pickup_name == tenant.name
            ):
                return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


@router.get("/{order_id}/proof-of-delivery/{kind}")
async def get_proof_of_delivery_image(
    order_id: str,
    kind: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    if kind not in ("photo", "signature"):
        raise HTTPException(status_code=404, detail="Unknown proof of delivery attachment.")

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await _authorize_pod_view(order, current_user, db)

    submission = (order.proof_of_delivery or {}).get("submission") or {}
    filepath = submission.get("photo_path" if kind == "photo" else "signature_path")

    if not filepath or not Path(filepath).is_file():
        raise HTTPException(status_code=404, detail="Proof of delivery file not found.")

    return FileResponse(filepath, filename=Path(filepath).name)


# -------------------------
# READY FOR PICKUP
# -------------------------
class ReadyUpdate(BaseModel):
    ready: bool


@router.patch("/{order_id}/ready")
async def toggle_ready(
    order_id: str,
    payload: ReadyUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access for tenant users.",
        )

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.ready_for_pickup = payload.ready
    await db.commit()
    await db.refresh(order)

    return {
        "success": True,
        "ready_for_pickup": order.ready_for_pickup
    }


# -------------------------
# SEND SENDER INVOICE
# -------------------------
@router.post("/{order_id}/notify/sender" ,description="Sends invoice to the sender as attachment")
async def send_sender_invoice(
    order_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Email the order invoice slip to the pickup/sender email address."""
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform admins can email order invoices.",
        )

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    pickup_email = (order.pickup_email or "").strip()
    if not pickup_email:
        raise HTTPException(
            status_code=400,
            detail="Order sender does not have a pickup email address.",
        )

    order_data = {
        "order_number": order.order_number,
        "status": order.status.value if order.status else "",
        "order_placed_time": order.order_placed_time,
        "pickup_name": order.pickup_name,
        "pickup_phone": order.pickup_phone,
        "pickup_email": order.pickup_email,
        "pickup_address": order.pickup_address,
        "pickup_date": order.pickup_date,
        "pickup_time": order.pickup_time,
        "delivery_name": order.delivery_name,
        "delivery_phone": order.delivery_phone,
        "delivery_email": order.delivery_email,
        "delivery_address": order.delivery_address,
        "delivery_date": order.delivery_date,
        "delivery_time": order.delivery_time,
        "items": order.items or [],
        "subtotal": order.subtotal,
        "tax_rate": order.tax_rate,
        "tax_amount": order.tax_amount,
        "delivery_fees": order.delivery_fees,
        "delivery_tips": order.delivery_tips,
        "discount": order.discount,
        "total": order.total,
        "payment_method": order.payment_method,
        "payment_details": order.payment_details or {},
    }

    send_order_sender_invoice_email.delay(
        email=pickup_email,
        order_number=order.order_number,
        order_data=order_data,
    )

    return {
        "success": True,
        "email": pickup_email,
        "order_id": order_id,
    }

# -------------------------
# ASSIGN DRIVER
# -------------------------
class AssignDriverRequest(BaseModel):
    driver_id: UUID


@router.patch("/{order_id}/assign-driver", response_model=OrderResponse)
async def assign_driver(
    order_id: str,
    payload: AssignDriverRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Assign a driver to an order. Driver must be an active tenant with role='driver'."""
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access for tenant users.",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.driver))
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    driver_result = await db.execute(
        select(Tenant).where(
            (Tenant.id == payload.driver_id) &
            (Tenant.role == TenantRole.driver) &
            (Tenant.is_active == True)
        )
    )
    driver = driver_result.scalar_one_or_none()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found or is not active"
        )

    try:
        order.driver_id = payload.driver_id
        order.published = False
        if order.activity_status == ActivityStatus.driver_not_assigned:
            order.activity_status = ActivityStatus.pickup_initiated

        await db.commit()
        await db.refresh(order)

        # Re-fetch with driver relationship loaded
        result = await db.execute(
            select(Order).where(Order.id == order.id).options(selectinload(Order.driver))
        )
        return result.scalar_one()

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Error assigning driver: {str(e)}"
        )


# -------------------------
# GET PUBLISHED ORDERS
# -------------------------
@router.get("/published", response_model=list[OrderResponse])
async def get_published_orders(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all orders that are published, not yet accepted (no driver),
    and within the 15-minute broadcast window.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only driver tenants can view published orders.",
        )

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant or tenant.role != TenantRole.driver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only driver tenants can view published orders.",
        )

    cutoff = datetime.now(APP_TIMEZONE) - timedelta(minutes=PUBLISH_WINDOW_MINUTES)
    result = await db.execute(
        select(Order)
        .where(
            Order.published == True,
            Order.driver_id == None,
            Order.published_at >= cutoff,
        )
        .options(selectinload(Order.driver))
        .order_by(Order.published_at.desc())
    )
    return result.scalars().all()


# -------------------------
# PUBLISH ORDER
# -------------------------
@router.post("/{order_id}/publish", response_model=OrderResponse)
async def publish_order(
    order_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Mark an order as published and broadcast to all connected driver clients."""
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform admins can publish orders.",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.driver))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.published = True
    order.published_at = datetime.now(APP_TIMEZONE)
    await db.commit()
    await db.refresh(order)

    # Re-fetch with relationship
    result = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.driver))
    )
    order = result.scalar_one()

    # Broadcast to all connected drivers
    from app.api.routers.ws import manager
    driver_fee = round(order.total * 0.05, 2)
    await manager.broadcast_to_all_drivers({
        "type": "new_order",
        "order": {
            "id": str(order.id),
            "order_number": order.order_number,
            "pickup_address": order.pickup_address,
            "delivery_address": order.delivery_address,
            "total": order.total,
            "driver_fee": driver_fee,
            "published_at": order.published_at.isoformat() if order.published_at else None,
        }
    })
    # Also broadcast to platform/admin connections so they can update their UI
    await manager.broadcast_to_all({
        "type": "order_published",
        "order_id": str(order.id),
    })

    return order


# -------------------------
# ACCEPT ORDER (driver self-assigns)
# -------------------------
@router.post("/{order_id}/accept", response_model=OrderResponse)
async def accept_order(
    order_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    A driver (tenant with role=driver) accepts a published order.
    Sets driver_id = current_user.tenant_id and un-publishes the order.
    """
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only driver tenants can accept orders.",
        )

    # Verify the caller is actually a driver
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant or tenant.role != TenantRole.driver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only driver tenants can accept orders.",
        )

    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.driver))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not order.published:
        raise HTTPException(status_code=400, detail="Order is not published.")

    if order.driver_id is not None:
        raise HTTPException(status_code=409, detail="Order already accepted by another driver.")

    # Check 15-min window
    cutoff = datetime.now(APP_TIMEZONE) - timedelta(minutes=PUBLISH_WINDOW_MINUTES)
    if order.published_at and order.published_at < cutoff:
        raise HTTPException(status_code=410, detail="Order broadcast window has expired.")

    order.driver_id = current_user.tenant_id
    order.published = False  # Remove from broadcast queue
    if order.activity_status == ActivityStatus.driver_not_assigned:
        order.activity_status = ActivityStatus.pickup_initiated

    await db.commit()
    await db.refresh(order)

    result = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.driver))
    )
    order = result.scalar_one()

    # Broadcast to all clients so the card disappears everywhere
    from app.api.routers.ws import manager
    await manager.broadcast_to_all({
        "type": "order_accepted",
        "order_id": str(order.id),
        "driver_id": str(current_user.tenant_id),
        "driver_name": tenant.contact_name or tenant.name,
    })

    return order


