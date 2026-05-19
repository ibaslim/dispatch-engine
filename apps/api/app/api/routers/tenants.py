from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timezone

from app.core.deps import get_db, TenantAdmin
from app.schemas.tenant import InviteTenantUserRequest, PendingInvitationResponse, TenantStatusResponse
from app.services.invitation_service import create_tenant_user_invitation
from app.models.tenant import Tenant
from app.models.invitation import Invitation

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


@router.get("/invitations", response_model=list[PendingInvitationResponse])
async def list_pending_invitations(
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    stmt = select(Invitation).where(
        Invitation.is_used.is_(False),
        Invitation.expires_at > now,
    )
    if not current_user.is_platform_admin:
        if not current_user.tenant_id:
            return []
        stmt = stmt.where(Invitation.tenant_id == current_user.tenant_id)

    result = await db.execute(stmt.order_by(Invitation.created_at.desc()))
    invitations = result.scalars().all()
    return invitations


@router.get("/status", response_model=list[TenantStatusResponse])
async def get_tenant_statuses(
    ids: list[str],
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
):
    if not ids:
        return []

    stmt = select(Tenant).where(Tenant.id.in_(ids))
    if not current_user.is_platform_admin and current_user.tenant_id:
        stmt = stmt.where(Tenant.id == current_user.tenant_id)

    result = await db.execute(stmt)
    tenants = result.scalars().all()
    return tenants
