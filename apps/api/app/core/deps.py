"""
Dependency injection utilities: DB session, current user, RBAC checks.
"""
from typing import Annotated, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.db.session import async_session_factory
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def _get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)],
    db: DBSession,
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise exc
    try:
        payload = decode_access_token(credentials.credentials)
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise exc
    except JWTError:
        raise exc

    result = await db.execute(
        select(User)
        .options(selectinload(User.roles))
        .where(User.id == UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise exc
    return user


CurrentUser = Annotated[User, Depends(_get_current_user)]


def require_platform_admin(current_user: CurrentUser) -> User:
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


PlatformAdmin = Annotated[User, Depends(require_platform_admin)]


def require_tenant_admin(current_user: CurrentUser) -> User:
    from app.models.user import UserRole as UserRoleModel
    has_role = any(
        r.role in ("tenant_admin",)
        for r in current_user.roles
    )
    if not has_role and not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant admin access required",
        )
    return current_user


TenantAdmin = Annotated[User, Depends(require_tenant_admin)]


def require_same_tenant(tenant_id: UUID, current_user: CurrentUser) -> None:
    """
    Enforce tenant isolation: raise 403 if the requesting user does not
    belong to the specified tenant (unless they are platform admin).
    """
    if current_user.is_platform_admin:
        return
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: cross-tenant operation not allowed",
        )


async def get_ws_user(websocket: WebSocket, db: AsyncSession) -> Optional[User]:
    """Extract and validate bearer token from WebSocket Authorization header."""
    auth_header = websocket.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub", "")
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()
        return user if (user and user.is_active) else None
    except (JWTError, ValueError):
        return None
