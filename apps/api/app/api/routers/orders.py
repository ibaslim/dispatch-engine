from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.core.deps import CurrentUser
from app.models.order import Order, OrderStatus, ActivityStatus
from app.models.tenant import Tenant, TenantRole
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdate
from uuid import UUID

router = APIRouter(tags=["Orders"])
APP_TIMEZONE = ZoneInfo("Asia/Karachi")


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
    result = await db.execute(
        select(Order).options(selectinload(Order.driver))
    )
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
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Read-only access for tenant users.",
        )

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.status = payload.status
    await db.commit()

    return {"success": True}


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