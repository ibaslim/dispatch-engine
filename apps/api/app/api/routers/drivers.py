from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, CurrentUser
from app.models.tenant import Tenant, TenantRole
from app.schemas.tenant import TenantResponse

router = APIRouter()


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
