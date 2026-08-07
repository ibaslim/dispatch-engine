import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, update
from sqlalchemy.orm import joinedload
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.deps import get_db, CurrentUser, PlatformAdmin
from app.core.redis import get_redis
from app.models.driver_payment import DriverPaymentGroupAssignment
from app.models.order import ActivityStatus, Order
from app.models.tenant import Tenant, TenantRole
from app.schemas.location import LocationIn, LocationOut
from app.schemas.tenant import TenantResponse
from app.services.driver_active_order_service import DriverActiveOrderService
from app.services.driver_location_flush_service import DriverLocationFlushService
from app.services.driver_location_service import DriverLocationService
from app.models.token import PushToken
from app.schemas.auth import PushTokenIn

router = APIRouter()

# Annotated alias keeps endpoint signatures concise.
RedisClient = Annotated[aioredis.Redis, Depends(get_redis)]

class DriverProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    contact_name: str | None
    contact_email: str | None
    contact_phone_country_code: str | None
    contact_phone_number: str | None
    address: str | None
    notes: str | None
    rating: float = 0
    vehicle_type: str | None = None
    plate_number: str | None = None
    is_online: bool = False
    completed_deliveries: int = 0
    payment_group_id: uuid.UUID | None = None
    payment_group_name: str | None = None
    payment_rule_type: str | None = None


@router.get("", response_model=list[DriverProfileOut])
async def list_driver_profiles(
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    drivers = list((await db.scalars(
        select(Tenant).where(Tenant.role == TenantRole.driver).order_by(Tenant.name)
    )).all())
    assignments = {
        item.driver_id: item.group
        for item in (await db.scalars(
            select(DriverPaymentGroupAssignment).options(joinedload(DriverPaymentGroupAssignment.group))
        )).all()
    }
    completion_counts = dict((await db.execute(
        select(Order.driver_id, func.count(Order.id))
        .where(Order.driver_id.is_not(None), Order.activity_status == ActivityStatus.delivered)
        .group_by(Order.driver_id)
    )).all())
    return [DriverProfileOut(
        id=driver.id,
        name=driver.name,
        is_active=driver.is_active,
        contact_name=driver.contact_name,
        contact_email=driver.contact_email,
        contact_phone_country_code=driver.contact_phone_country_code,
        contact_phone_number=driver.contact_phone_number,
        address=driver.address,
        notes=driver.notes,
        completed_deliveries=completion_counts.get(driver.id, 0),
        payment_group_id=assignments[driver.id].id if driver.id in assignments else None,
        payment_group_name=assignments[driver.id].name if driver.id in assignments else None,
        payment_rule_type=assignments[driver.id].rule_type if driver.id in assignments else None,
    ) for driver in drivers]


@router.get("/available", response_model=list[TenantResponse])
async def get_available_drivers(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get list of all available drivers from tenants table where role='driver'."""
    result = await db.execute(
        select(Tenant).where(
            (Tenant.role == TenantRole.driver) &
            (Tenant.is_active == True)
        ).order_by(Tenant.name)
    )
    drivers = result.scalars().all()
    return drivers


@router.get("/me/jobs")
async def get_my_jobs(current_user: CurrentUser):
    """Stub: return assigned jobs for the authenticated driver."""
    return []


@router.post("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(
    body: PushTokenIn,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Register or refresh this device's FCM token.
    Drivers are single-session, so exactly one token stays active per user. Login
    already clears the old device's token; this also covers FCM rotating a token
    on the same device, which would otherwise leave two live rows.

    Upsert rather than insert: re-binds to the caller, since a handset can change hands.
    """


    now = datetime.now(timezone.utc)

    existing = await db.scalar(select(PushToken).where(PushToken.token == body.token))
    if existing:
        existing.user_id = current_user.id
        existing.platform = body.platform
        existing.is_active = True
        existing.last_seen_at = now
    else:
        db.add(
            PushToken(
                user_id=current_user.id,
                token=body.token,
                platform=body.platform,
                is_active=True,
                last_seen_at=now,
            )
        )

    await db.execute(
        update(PushToken)
        .where(
            PushToken.user_id == current_user.id,
            PushToken.token != body.token,
            PushToken.is_active.is_(True),
        )
        .values(is_active=False)
    )

    try:
        await db.commit()
    except IntegrityError:
        # Concurrent login on the same device already wrote this. Nothing to fix.
        await db.rollback()


@router.post("/me/push-token/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_push_token(
    body: PushTokenIn,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:


    await db.execute(
        update(PushToken)
        .where(PushToken.token == body.token, PushToken.user_id == current_user.id)
        .values(is_active=False)
    )
    await db.commit()


# ─── Driver location heartbeat ───────────────────────────────────────────────

@router.post("/me/location", status_code=status.HTTP_204_NO_CONTENT)
async def push_driver_location(
    body: LocationIn,
    current_user: CurrentUser,
    redis: RedisClient,
    db: AsyncSession = Depends(get_db),
) -> None:

    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a driver tenant.",
        )

    driver_id = current_user.tenant_id

    # 1. Update latest live location in Redis for real-time map tracking
    service = DriverLocationService(redis)
    await service.set(driver_id, body.lat, body.lng)

    # 2. Resolve active in-transit order ID for historical log
    active_order_service = DriverActiveOrderService(redis)
    active_order_id = await active_order_service.get_active_order_id(driver_id, db)

    # 3. Append history log to per-driver Redis list
    await service.push_to_history(
        driver_id=driver_id,
        lat=body.lat,
        lng=body.lng,
        order_id=active_order_id,
    )


@router.delete("/me/location", status_code=status.HTTP_204_NO_CONTENT)
async def clear_driver_location(
    current_user: CurrentUser,
    redis: RedisClient,
) -> None:
    if not current_user.tenant_id:
        return  # Not a driver tenant — nothing to delete.
    service = DriverLocationService(redis)
    await service.delete(current_user.tenant_id)


# ─── Public driver location read ─────────────────────────────────────────────

@router.get("/{driver_id}/location", response_model=LocationOut)
async def get_driver_location(
    driver_id: uuid.UUID,
    redis: RedisClient,
) -> LocationOut:
    """
    Returns 404 if the driver is offline or the location has expired
    """
    service = DriverLocationService(redis)
    loc = await service.get(driver_id)
    if loc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver location not available. Driver may be offline.",
        )
    return LocationOut(
        driver_id=loc.driver_id,
        lat=loc.lat,
        lng=loc.lng,
        updated_at=loc.updated_at.isoformat(),
    )