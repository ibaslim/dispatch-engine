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
PUBLISH_WINDOW_MINUTES = 15


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
