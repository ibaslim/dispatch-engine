from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select
from app.core.deps import get_db, PlatformAdmin
from app.schemas.tenant import InviteTenantAdminRequest
from app.services.invitation_service import create_tenant_admin_invitation
from app.models.tenant import Tenant
from app.workers.tasks import send_tenant_suspended_email

router = APIRouter()


@router.post("/tenants/invite", status_code=status.HTTP_204_NO_CONTENT)
async def invite_tenant_admin(
    req: InviteTenantAdminRequest,
    current_user: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await create_tenant_admin_invitation(
        db=db,
        email=req.email,
        name=req.name,
        tenant_name=req.tenant_name,
        invited_by=current_user,
    )


@router.post("/tenants/{tenant_id}/suspend", status_code=status.HTTP_204_NO_CONTENT)
async def suspend_tenant(
    tenant_id: str,
    current_user: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    tenant.is_active = False
    db.add(tenant)
    await db.commit()

    if tenant.contact_email:
        send_tenant_suspended_email.delay(
            tenant_name=tenant.name, contact_email=tenant.contact_email
        )


@router.post("/tenants/{tenant_id}/unsuspend", status_code=status.HTTP_204_NO_CONTENT)
async def unsuspend_tenant(
    tenant_id: str,
    current_user: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    tenant.is_active = True
    db.add(tenant)
    await db.commit()
