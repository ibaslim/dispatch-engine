from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.deps import get_db, TenantAdmin
from app.schemas.tenant import InviteTenantUserRequest
from app.services.invitation_service import create_tenant_user_invitation
from app.models.tenant import Tenant

router = APIRouter()


class UsernameCheckResponse(BaseModel):
    available: bool


@router.get("/check-username/{username}", response_model=UsernameCheckResponse)
async def check_username_availability(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Check if a username is available in the tenants table."""
    if not username or len(username) < 3:
        return UsernameCheckResponse(available=False)

    result = await db.execute(
        select(Tenant).where(Tenant.username == username)
    )
    tenant = result.scalar_one_or_none()
    return UsernameCheckResponse(available=tenant is None)


@router.post("/invite", status_code=status.HTTP_204_NO_CONTENT)
async def invite_tenant_user(
    req: InviteTenantUserRequest,
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
):
    try:
        await create_tenant_user_invitation(
            db=db,
            email=req.email,
            role=req.role,
            invited_by=current_user,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/suspend", status_code=status.HTTP_204_NO_CONTENT)
async def suspend_my_tenant(
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
):
    # TenantAdmin ensured current_user has tenant context
    if not current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No tenant associated with current user.")
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    tenant.is_active = False
    db.add(tenant)
    await db.commit()


@router.post("/unsuspend", status_code=status.HTTP_204_NO_CONTENT)
async def unsuspend_my_tenant(
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
):
    if not current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No tenant associated with current user.")
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    tenant.is_active = True
    db.add(tenant)
    await db.commit()
