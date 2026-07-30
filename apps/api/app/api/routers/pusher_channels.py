"""Authenticated Pusher Channels subscription endpoint."""

from fastapi import APIRouter, Depends, Form, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_db
from app.models.tenant import Tenant, TenantRole
from app.services.pusher_service import (
    DRIVERS_CHANNEL,
    PLATFORM_CHANNEL,
    pusher_service,
    tenant_channel,
)


router = APIRouter()


def can_access_channel(
    *,
    channel_name: str,
    is_platform_admin: bool,
    tenant_id: object | None,
    tenant_role: TenantRole | str | None,
) -> bool:
    """Return whether the authenticated identity may subscribe to a channel."""
    if channel_name == PLATFORM_CHANNEL:
        return is_platform_admin
    if channel_name == DRIVERS_CHANNEL:
        return tenant_id is not None and tenant_role == TenantRole.driver
    return tenant_id is not None and channel_name == tenant_channel(str(tenant_id))


@router.post("/auth")
async def authorize_pusher_channel(
    current_user: CurrentUser,
    socket_id: str = Form(...),
    channel_name: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Authorize a browser subscription using the existing bearer JWT."""
    if not pusher_service.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pusher Channels is not configured.",
        )

    tenant_role: TenantRole | str | None = None
    if current_user.tenant_id:
        tenant_role = await db.scalar(
            select(Tenant.role).where(Tenant.id == current_user.tenant_id)
        )

    if not can_access_channel(
        channel_name=channel_name,
        is_platform_admin=current_user.is_platform_admin,
        tenant_id=current_user.tenant_id,
        tenant_role=tenant_role,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to subscribe to this channel.",
        )

    try:
        return pusher_service.authorize_channel(channel_name, socket_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Pusher channel authorization request.",
        ) from exc
