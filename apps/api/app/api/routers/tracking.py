from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.order import Order
from app.schemas.order import PublicOrderTracking

router = APIRouter()


@router.get("/{token}")
async def get_tracking(token: str):
    """
    Public endpoint: return tracking info for a delivery token.
    Token is high-entropy and associated with a specific order.
    Stub implementation — returns placeholder data.
    """
    # TODO: look up order by tracking token, return live status
    # For now return a stub so the tracking web app can render
    return {
        "order_id": "stub-order-id",
        "status": "in_transit",
        "driver_name": None,
        "estimated_arrival": None,
        "last_location": None,
    }


@router.get("/{token}/order", response_model=PublicOrderTracking)
async def get_tracking_order_details(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint: return order details for the tracking page.
    Accepts either the order's UUID (from the tracking link) or the
    order number (typed by the user, e.g. ORD16072601). Only
    recipient-relevant fields are exposed — no contact, payment or
    internal data.
    """
    query = select(Order).options(selectinload(Order.driver))
    try:
        query = query.where(Order.id == UUID(token))
    except ValueError:
        query = query.where(Order.order_number == token.strip().upper())

    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    return PublicOrderTracking(
        order_number=order.order_number,
        status=order.status,
        activity_status=order.activity_status,
        driver_name=order.driver.name if order.driver else None,
        pickup_name=order.pickup_name,
        pickup_address=order.pickup_address,
        pickup_date=order.pickup_date,
        pickup_time=order.pickup_time,
        delivery_name=order.delivery_name,
        delivery_address=order.delivery_address,
        delivery_date=order.delivery_date,
        delivery_time=order.delivery_time,
        items_count=len(order.items or []),
        created_at=order.created_at,
        pickup_initiated_at=order.pickup_initiated_at,
        picked_up_at=order.picked_up_at,
        delivery_initiated_at=order.delivery_initiated_at,
        delivery_in_progress_at=order.delivery_in_progress_at,
        delivered_at=order.delivered_at,
    )