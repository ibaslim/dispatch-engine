import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload
import redis.asyncio as aioredis

from app.core.deps import get_db, CurrentUser, PlatformAdmin
from app.core.redis import get_redis
from app.models.driver_payment import DriverPaymentGroupAssignment
from app.models.order import ActivityStatus, Order
from app.models.tenant import Tenant, TenantRole
from app.schemas.location import LocationIn, LocationOut
from app.schemas.tenant import TenantResponse
from app.services.driver_location_service import DriverLocationService

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


@router.post("/me/push-token", status_code=204)
async def register_push_token(
    body: dict,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Register FCM push token for the current driver."""
    from app.models.token import PushToken
    from sqlalchemy import select, update

    token = body.get("token")
    platform = body.get("platform", "android")

    if not token:
        return

    # Deactivate old tokens for this user
    await db.execute(
        update(PushToken)
        .where(PushToken.user_id == current_user.id)
        .values(is_active=False)
    )

    new_token = PushToken(
        user_id=current_user.id,
        token=token,
        platform=platform,
        is_active=True,
    )
    db.add(new_token)
    await db.commit()


# ─── Driver location heartbeat ───────────────────────────────────────────────

@router.post("/me/location", status_code=status.HTTP_204_NO_CONTENT)
async def push_driver_location(
    body: LocationIn,
    current_user: CurrentUser,
    redis: RedisClient,
) -> None:

    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not associated with a driver tenant.",
        )
    service = DriverLocationService(redis)
    await service.set(current_user.tenant_id, body.lat, body.lng)


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