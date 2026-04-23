from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdate
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

router = APIRouter(tags=["Orders"])


def get_order_status(pickup_time: str, delivery_time: str):
    from datetime import datetime

    fmt = "%H:%M"

    p = datetime.strptime(pickup_time, fmt)
    d = datetime.strptime(delivery_time, fmt)

    diff_hours = (d - p).total_seconds() / 3600

    return "current" if diff_hours < 3 else "scheduled"

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
        data["order_placed_time"] = datetime.now().astimezone(ZoneInfo("Asia/Karachi")).strftime("%I:%M %p")

        data["status"] = get_order_status(
            data["pickup_time"],
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

    for key, value in update_data.items():
        setattr(order, key, value)

    await db.commit()
    await db.refresh(order)

    return order


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
    status: str


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