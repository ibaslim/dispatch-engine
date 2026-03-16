from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, PlatformAdmin
from app.schemas.tenant import InviteTenantAdminRequest
from app.services.invitation_service import create_tenant_admin_invitation

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
