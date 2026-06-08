from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import sqlalchemy as sa
from typing import Union

from app.core.deps import get_db, CurrentUserAllowInactiveAndSuspended
from app.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    MeResponse, ForgotPasswordRequest, ResetPasswordRequest, PendingApprovalResponse,
    SuspendedAccountResponse,
)
from app.services.auth_service import (
    authenticate_user, create_token_pair,
    refresh_access_token, revoke_refresh_token,
)
from app.models.tenant import Tenant

router = APIRouter()


@router.post("/login", response_model=Union[TokenResponse, PendingApprovalResponse, SuspendedAccountResponse])
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await authenticate_user(db, req.email, req.password)
    
    if isinstance(result, (PendingApprovalResponse, SuspendedAccountResponse)):
        return result
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return await create_token_pair(db, result)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    tokens = await refresh_access_token(db, req.refresh_token)
    if tokens is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    await revoke_refresh_token(db, req.refresh_token)


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: CurrentUserAllowInactiveAndSuspended,
    db: AsyncSession = Depends(get_db),
):
    tenant_is_active = None
    tenant_role = None
    if current_user.tenant_id:
        tenant_result = await db.execute(sa.select(Tenant).where(Tenant.id == current_user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        tenant_is_active = tenant.is_active if tenant is not None else None
        tenant_role = tenant.role.value if tenant is not None and tenant.role is not None else None

    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        is_platform_admin=current_user.is_platform_admin,
        tenant_id=str(current_user.tenant_id) if current_user.tenant_id else None,
        tenant_is_active=tenant_is_active,
        tenant_role=tenant_role,
        roles=[r.role for r in current_user.roles],
    )


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Stub: enqueue password reset email."""
    # In a full implementation, find user, generate reset token, enqueue email
    # Returning 204 regardless prevents user enumeration
    pass


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Stub: validate reset token and update password."""
    pass
