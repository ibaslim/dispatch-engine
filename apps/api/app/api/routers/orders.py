import base64
import mimetypes
import os
from decimal import Decimal
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import settings
from app.core.deps import CurrentUser
from app.core.redis import get_redis
from app.db.session import get_db
from app.models.order import Order, OrderStatus, ActivityStatus
from app.models.tenant import Tenant, TenantRole
from app.models.delivery_configuration import DeliveryPolicy
from app.models.driver_payment import DriverPaymentGroupAssignment
from app.services.driver_active_order_service import DriverActiveOrderService
from app.services.delivery_quote_service import (
    DeliveryQuote,
    DeliveryQuoteError,
    build_delivery_quote,
    build_manual_delivery_quote,
)
from app.services.driver_payout_service import (
    apply_driver_payout_snapshot,
    calculate_driver_payout,
    clear_driver_payout_snapshot,
    get_driver_payment_group,
)
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
from app.workers.tasks import (
    send_order_sender_invoice_email,
    send_order_delivered_email,
    send_order_recipient_notification_email,
)
from uuid import UUID, uuid4

router = APIRouter(tags=["Orders"])
APP_TIMEZONE = ZoneInfo("Asia/Karachi")
PUBLISH_WINDOW_MINUTES = 15

ACTIVITY_STATUS_TIMESTAMP_FIELDS: dict[ActivityStatus, str] = {
    ActivityStatus.pickup_initiated: "pickup_initiated_at",
    ActivityStatus.picked_up: "picked_up_at",
    ActivityStatus.delivery_initiated: "delivery_initiated_at",
    ActivityStatus.delivery_in_progress: "delivery_in_progress_at",
    ActivityStatus.delivered: "delivered_at",
}


class DeliveryQuoteRequest(BaseModel):
    pickup_place_id: str
    delivery_place_id: str
    pickup_address: str | None = None
    delivery_address: str | None = None
    delivery_category_id: UUID
    vendor_id: UUID | None = None
    delivery_date: str | None = None
    delivery_time: str | None = None
    surcharge_ids: list[UUID] = Field(default_factory=list)


class AppliedChargeResponse(BaseModel):
    id: UUID | None
    kind: str
    label: str
    amount: float


class DeliveryQuoteResponse(BaseModel):
    eligible: bool = True
    pickup_city: str
    pickup_zone_id: UUID
    pickup_zone_name: str
    delivery_city: str
    delivery_zone_id: UUID
    delivery_zone_name: str
    distance_meters: int
    distance_km: float
    duration_seconds: int
    radius_km: float
    extra_distance_km: float
    base_price: float
    additional_per_km: float
    distance_charge: float
    applied_charges: list[AppliedChargeResponse]
    delivery_fee: float
    manual_fallback: bool = False


def _quote_response(quote: DeliveryQuote) -> DeliveryQuoteResponse:
    return DeliveryQuoteResponse(
        pickup_city=quote.pickup.city.name,
        pickup_zone_id=quote.pickup.zone.id,
        pickup_zone_name=quote.pickup.zone.name,
        delivery_city=quote.delivery.city.name,
        delivery_zone_id=quote.delivery.zone.id,
        delivery_zone_name=quote.delivery.zone.name,
        distance_meters=quote.distance_meters,
        distance_km=round(quote.distance_meters / 1000, 2),
        duration_seconds=quote.duration_seconds,
        radius_km=float(quote.radius_km),
        extra_distance_km=float(quote.extra_distance_km),
        base_price=float(quote.base_price),
        additional_per_km=float(quote.additional_per_km),
        distance_charge=float(quote.distance_charge),
        applied_charges=[
            AppliedChargeResponse(
                id=item.id, kind=item.kind, label=item.label, amount=float(item.amount)
            )
            for item in quote.applied_charges
        ],
        delivery_fee=float(quote.delivery_fee),
        manual_fallback=quote.manual_fallback,
    )


def _apply_quote(data: dict, quote: DeliveryQuote) -> None:
    data.update(
        pickup_address=quote.pickup.place.formatted_address,
        pickup_place_id=quote.pickup.place.place_id,
        pickup_latitude=quote.pickup.place.latitude,
        pickup_longitude=quote.pickup.place.longitude,
        pickup_city_id=quote.pickup.city.id,
        pickup_zone_id=quote.pickup.zone.id,
        delivery_address=quote.delivery.place.formatted_address,
        delivery_place_id=quote.delivery.place.place_id,
        delivery_latitude=quote.delivery.place.latitude,
        delivery_longitude=quote.delivery.place.longitude,
        delivery_city_id=quote.delivery.city.id,
        delivery_zone_id=quote.delivery.zone.id,
        route_distance_meters=quote.distance_meters,
        route_duration_seconds=quote.duration_seconds,
        applied_charges=[
            {
                "id": str(item.id) if item.id else None,
                "kind": item.kind,
                "label": item.label,
                "amount": float(item.amount),
            }
            for item in quote.applied_charges
        ],
        delivery_fees=float(quote.delivery_fee),
    )
    total = (
        Decimal(str(data.get("subtotal") or 0))
        + Decimal(str(data.get("tax_amount") or 0))
        + quote.delivery_fee
        + Decimal(str(data.get("delivery_tips") or 0))
        - Decimal(str(data.get("discount") or 0))
    )
    data["total"] = float(total.quantize(Decimal("0.01")))


async def _apply_default_tax(db: AsyncSession, data: dict) -> None:
    policy = await db.scalar(select(DeliveryPolicy).where(DeliveryPolicy.key == "default"))
    tax_rate = Decimal(policy.default_tax_percentage) if policy else Decimal("0.00")
    subtotal = Decimal(str(data.get("subtotal") or 0))
    tax_amount = (subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
    data["tax_rate"] = float(tax_rate)
    data["tax_amount"] = float(tax_amount)


async def _get_quote_or_http_error(
    db: AsyncSession,
    pickup_place_id: str | None,
    delivery_place_id: str | None,
    category_id: UUID | None,
    vendor_id: UUID | None = None,
    delivery_date: str | None = None,
    delivery_time: str | None = None,
    surcharge_ids: list[UUID] | None = None,
    pickup_address: str | None = None,
    delivery_address: str | None = None,
) -> DeliveryQuote:
    if not pickup_place_id or not delivery_place_id:
        raise HTTPException(status_code=422, detail="Select valid pickup and delivery addresses.")
    if not category_id:
        raise HTTPException(status_code=422, detail="Select a delivery category.")
    try:
        is_manual = pickup_place_id.startswith("manual:") or delivery_place_id.startswith("manual:")
        if is_manual:
            if not pickup_place_id.startswith("manual:") or not delivery_place_id.startswith("manual:"):
                raise DeliveryQuoteError(
                    "Google Maps is unavailable. Enter both pickup and delivery addresses manually."
                )
            return await build_manual_delivery_quote(
                db=db,
                pickup_address=pickup_address or "",
                delivery_address=delivery_address or "",
                category_id=category_id,
                vendor_id=vendor_id,
                delivery_date=delivery_date,
                delivery_time=delivery_time,
                surcharge_ids=surcharge_ids,
            )
        return await build_delivery_quote(
            db=db,
            pickup_place_id=pickup_place_id,
            delivery_place_id=delivery_place_id,
            category_id=category_id,
            vendor_id=vendor_id,
            delivery_date=delivery_date,
            delivery_time=delivery_time,
            surcharge_ids=surcharge_ids,
        )
    except DeliveryQuoteError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


def _stamp_activity_status(order: Order, new_status: ActivityStatus) -> None:
    """Set the order's activity status and record the first time it was reached."""
    order.activity_status = new_status
    field = ACTIVITY_STATUS_TIMESTAMP_FIELDS.get(new_status)
    if field and getattr(order, field) is None:
        setattr(order, field, datetime.now(APP_TIMEZONE))


def _driver_order_response(order: Order, payment_group) -> dict:
    """Return operational order data plus payout, without platform finances."""
    has_locked_payout = order.driver_id is not None and order.driver_payout is not None
    payout = None if has_locked_payout else calculate_driver_payout(
        payment_group, order.delivery_fees, order.delivery_tips
    )
    response = OrderResponse.model_validate(order).model_dump()
    response.update(
        subtotal=0,
        tax_rate=0,
        tax_amount=0,
        delivery_fees=0,
        delivery_tips=0,
        discount=0,
        total=0,
        surcharge_ids=[],
        applied_charges=[],
        payment_details=None,
        driver_payout=float(order.driver_payout if has_locked_payout else payout.total),
        driver_fee_payout=float(
            order.driver_fee_payout if has_locked_payout else payout.delivery_fee
        ),
        driver_tip_payout=float(
            order.driver_tip_payout if has_locked_payout else payout.tip
        ),
        driver_payment_rule=(
            order.driver_payment_rule if has_locked_payout else payout.rule_type
        ),
    )
    response["items"] = [
        {**item, "itemPrice": 0}
        for item in response.get("items", [])
    ]
    return response


async def _driver_order_responses(
    db: AsyncSession,
    driver_id: UUID,
    orders: list[Order],
) -> list[dict]:
    payment_group = await get_driver_payment_group(db, driver_id)
    return [_driver_order_response(order, payment_group) for order in orders]

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
    driver_id = None

    if not current_user.is_platform_admin and current_user.tenant_id:
        result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            if tenant.role == TenantRole.driver:
                driver_id = tenant.id
                query = query.where(Order.driver_id == current_user.tenant_id)
            elif tenant.role == TenantRole.vendor:
                # Also check pickup_name fallback just in case vendor_id isn't populated
                query = query.where(
                    (Order.vendor_id == current_user.tenant_id) |
                    (Order.pickup_name == tenant.name)
                )

    result = await db.execute(query)
    orders = list(result.scalars().all())
    if driver_id:
        return await _driver_order_responses(db, driver_id, orders)
    return orders


@router.post("/quote", response_model=DeliveryQuoteResponse)
async def quote_delivery(
    payload: DeliveryQuoteRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform admin access required.")
    quote = await _get_quote_or_http_error(
        db,
        payload.pickup_place_id,
        payload.delivery_place_id,
        payload.delivery_category_id,
        payload.vendor_id,
        payload.delivery_date,
        payload.delivery_time,
        payload.surcharge_ids,
        payload.pickup_address,
        payload.delivery_address,
    )
    return _quote_response(quote)


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

        await _apply_default_tax(db, data)

        quote = await _get_quote_or_http_error(
            db,
            data.get("pickup_place_id"),
            data.get("delivery_place_id"),
            data.get("delivery_category_id"),
            data.get("vendor_id"),
            data.get("delivery_date"),
            data.get("delivery_time"),
            data.get("surcharge_ids"),
            data.get("pickup_address"),
            data.get("delivery_address"),
        )
        _apply_quote(data, quote)
        data["surcharge_ids"] = [str(value) for value in data.get("surcharge_ids", [])]

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
        if order.driver_id:
            payment_group = await get_driver_payment_group(db, order.driver_id)
            apply_driver_payout_snapshot(order, payment_group)
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
    # The charge breakdown is always recalculated by the server.
    update_data.pop("applied_charges", None)

    if {"subtotal", "items", "tax_rate", "tax_amount"}.intersection(update_data):
        tax_data = {"subtotal": update_data.get("subtotal", order.subtotal)}
        await _apply_default_tax(db, tax_data)
        update_data.update(tax_data)

    quote_fields = {
        "pickup_address",
        "delivery_address",
        "pickup_place_id",
        "delivery_place_id",
        "delivery_category_id",
        "vendor_id",
        "delivery_date",
        "delivery_time",
        "surcharge_ids",
    }
    if quote_fields.intersection(update_data):
        quote = await _get_quote_or_http_error(
            db,
            update_data.get("pickup_place_id", order.pickup_place_id),
            update_data.get("delivery_place_id", order.delivery_place_id),
            update_data.get("delivery_category_id", order.delivery_category_id),
            update_data.get("vendor_id", order.vendor_id),
            update_data.get("delivery_date", order.delivery_date),
            update_data.get("delivery_time", order.delivery_time),
            update_data.get("surcharge_ids", order.surcharge_ids),
            update_data.get("pickup_address", order.pickup_address),
            update_data.get("delivery_address", order.delivery_address),
        )
        merged_totals = {
            "subtotal": update_data.get("subtotal", order.subtotal),
            "tax_amount": update_data.get("tax_amount", order.tax_amount),
            "delivery_tips": update_data.get("delivery_tips", order.delivery_tips),
            "discount": update_data.get("discount", order.discount),
        }
        _apply_quote(merged_totals, quote)
        update_data.update(merged_totals)

    if "surcharge_ids" in update_data:
        update_data["surcharge_ids"] = [
            str(value) for value in (update_data["surcharge_ids"] or [])
        ]

    # Editing an order must not wipe an already-captured POD submission
    # (signature/photo paths written by the driver upload endpoints).
    if "proof_of_delivery" in update_data:
        existing_submission = (order.proof_of_delivery or {}).get("submission")
        incoming = dict(update_data["proof_of_delivery"] or {})
        if existing_submission and not incoming.get("submission"):
            incoming["submission"] = existing_submission
        update_data["proof_of_delivery"] = incoming

    try:
        previous_driver_id = order.driver_id
        for key, value in update_data.items():
            setattr(order, key, value)

        if "driver_id" in update_data and order.driver_id != previous_driver_id:
            if order.driver_id is None:
                clear_driver_payout_snapshot(order)
            else:
                payment_group = await get_driver_payment_group(db, order.driver_id)
                apply_driver_payout_snapshot(order, payment_group)

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
    redis=Depends(get_redis),
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
    _stamp_activity_status(order, payload.activity_status)

    is_new_delivery = (
        payload.activity_status == ActivityStatus.delivered
        and previous_activity_status != ActivityStatus.delivered
    )
    if is_new_delivery:
        order.status = OrderStatus.completed

    await db.commit()

    # Sync driver active order cache for location history
    if order.driver_id and redis:
        active_order_svc = DriverActiveOrderService(redis)
        if payload.activity_status == ActivityStatus.delivery_in_progress:
            await active_order_svc.set_active_order(order.driver_id, order.id)
        elif previous_activity_status == ActivityStatus.delivery_in_progress:
            await active_order_svc.clear_active_order(order.driver_id, order.id)

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
# SEND RECIPIENT NOTIFICATION
# -------------------------
@router.post("/{order_id}/notify/recipient", description="Notifies the recipient with order details and a tracking link")
async def send_recipient_notification(
    order_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Email the recipient with sender/receiver info, item breakdown, totals, and a tracking link."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_assigned_driver = bool(current_user.tenant_id) and order.driver_id == current_user.tenant_id
    if not current_user.is_platform_admin and not is_assigned_driver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform admins or the assigned driver can email order recipients.",
        )

    delivery_email = (order.delivery_email or "").strip()
    if not delivery_email:
        raise HTTPException(
            status_code=400,
            detail="Order recipient does not have a delivery email address.",
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
    }

    tracking_url = f"{settings.tracking_web_base_url.rstrip('/')}/t/{order.id}"

    send_order_recipient_notification_email.delay(
        email=delivery_email,
        order_number=order.order_number,
        order_data=order_data,
        tracking_url=tracking_url,
    )

    return {
        "success": True,
        "email": delivery_email,
        "order_id": order_id,
        "tracking_url": tracking_url,
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
    redis=Depends(get_redis),
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
        old_driver_id = order.driver_id
        driver_changed = order.driver_id != payload.driver_id
        order.driver_id = payload.driver_id
        order.published = False
        if driver_changed:
            payment_group = await get_driver_payment_group(db, payload.driver_id)
            apply_driver_payout_snapshot(order, payment_group)
        if order.activity_status == ActivityStatus.driver_not_assigned:
            _stamp_activity_status(order, ActivityStatus.pickup_initiated)

        await db.commit()
        await db.refresh(order)

        if redis:
            active_order_svc = DriverActiveOrderService(redis)
            if driver_changed and old_driver_id:
                await active_order_svc.clear_active_order(old_driver_id, order.id)
            if order.activity_status == ActivityStatus.delivery_in_progress:
                await active_order_svc.set_active_order(payload.driver_id, order.id)

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
    orders = list(result.scalars().all())
    return await _driver_order_responses(db, tenant.id, orders)


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

    # Each driver receives only their group-based payout; platform pricing is
    # deliberately omitted from the driver websocket payload.
    from app.api.routers.ws import manager
    driver_ids = list((await db.scalars(
        select(Tenant.id).where(Tenant.role == TenantRole.driver, Tenant.is_active.is_(True))
    )).all())
    assignments = {
        assignment.driver_id: assignment.group
        for assignment in (await db.scalars(
            select(DriverPaymentGroupAssignment).options(
                joinedload(DriverPaymentGroupAssignment.group)
            )
        )).all()
    }
    for driver_id in driver_ids:
        payout = calculate_driver_payout(
            assignments.get(driver_id),
            order.delivery_fees,
            order.delivery_tips,
        )
        await manager.broadcast_to_tenant(str(driver_id), {
            "type": "new_order",
            "order": {
                "id": str(order.id),
                "order_number": order.order_number,
                "pickup_address": order.pickup_address,
                "delivery_address": order.delivery_address,
                "driver_payout": float(payout.total),
                "driver_fee_payout": float(payout.delivery_fee),
                "driver_tip_payout": float(payout.tip),
                "driver_payment_rule": payout.rule_type,
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
    payment_group = await get_driver_payment_group(db, tenant.id)
    apply_driver_payout_snapshot(order, payment_group)
    if order.activity_status == ActivityStatus.driver_not_assigned:
        _stamp_activity_status(order, ActivityStatus.pickup_initiated)

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

    return _driver_order_response(order, payment_group)
