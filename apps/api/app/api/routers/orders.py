from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderResponse, OrderUpdate

router = APIRouter(tags=["Orders"])


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
        order = Order(**payload.model_dump())

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