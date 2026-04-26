from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.order import Order, OrderStatus
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdate

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

# -------------------------
# GET ORDERS
# -------------------------
@router.get("/", response_model=list[OrderResponse])
async def get_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order))
    return result.scalars().all()


# -------------------------
# CREATE ORDER
# -------------------------
@router.post("/", response_model=OrderResponse)
async def create_order(payload: OrderCreate, db: AsyncSession = Depends(get_db)):
    try:
        data = payload.model_dump()

        # ADD THIS LINE (order placed time in AM/PM)
        data["order_placed_time"] = datetime.now(APP_TIMEZONE).strftime("%I:%M %p")

        data["status"] = get_order_status(
            data["pickup_date"],
            data["pickup_time"],
            data["delivery_date"],
            data["delivery_time"])
        
        order = Order(**data)

        db.add(order)
        await db.commit()
        await db.refresh(order)

        return order

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Order number already exists. Please use a unique order number."
        )


# -------------------------
# UPDATE ORDER (NEW)
# -------------------------
@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    payload: OrderUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    update_data = payload.model_dump(exclude_unset=True)

    try:
        for key, value in update_data.items():
            setattr(order, key, value)

        schedule_fields = {
            "pickup_date",
            "pickup_time",
            "delivery_date",
            "delivery_time",
        }
        if "status" not in update_data and schedule_fields.intersection(update_data):
            order.status = get_order_status(
                order.pickup_date,
                order.pickup_time,
                order.delivery_date,
                order.delivery_time,
            )

        await db.commit()
        await db.refresh(order)

        return order
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Order number already exists. Please use a unique order number."
        )


# -------------------------
# DELETE ORDER (NEW)
# -------------------------
@router.delete("/{order_id}")
async def delete_order(order_id: str, db: AsyncSession = Depends(get_db)):
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
    db: AsyncSession = Depends(get_db),
):
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
    db: AsyncSession = Depends(get_db),
):
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
