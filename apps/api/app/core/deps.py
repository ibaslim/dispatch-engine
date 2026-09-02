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
from sqlalchemy.orm import joinedload, selectinload

from app.core.security import decode_access_token
from app.db.session import get_db as _get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


get_db = _get_db


DBSession = Annotated[AsyncSession, Depends(get_db)]


def _token_is_revoked(payload: dict, user: User) -> bool:
    """True when this access token predates the user's last session revocation.

    Strict `<`: login stamps the column then issues the token, and `iat` is whole
    seconds — `<=` would make a fresh login revoke itself.
    """
    if user.tokens_valid_from is None:
        return False
    issued_at = payload.get("iat")
    if issued_at is None:
        return True
    return int(issued_at) < int(user.tokens_valid_from.timestamp())


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
        token: str = credentials.credentials
        payload = decode_access_token(token)
        if payload.get("type") != "access":
            raise exc
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise exc
        user_uuid = UUID(user_id)
    except (JWTError, ValueError):
        raise exc

    # joinedload rather than a follow-up SELECT: this runs on every authenticated
    # request, and the tenant is a many-to-one, so it costs a LEFT JOIN instead of
    # a second round trip. Also makes `current_user.tenant` safe to read — lazy
    # loading raises MissingGreenlet under async.
    result = await db.execute(
        select(User)
        .options(joinedload(User.tenant), selectinload(User.roles))
        .where(User.id == user_uuid)
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise exc
    if _token_is_revoked(payload, user):
        raise exc
    # A tenant_id pointing at a missing tenant row stays allowed, as before.
    if user.tenant is not None and not user.tenant.is_active:
        raise exc
    return user


CurrentUser = Annotated[User, Depends(_get_current_user)]


async def _get_current_user_allow_inactive(
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
        token: str = credentials.credentials
        payload = decode_access_token(token)
        if payload.get("type") != "access":
            raise exc
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise exc
        user_uuid = UUID(user_id)
    except (JWTError, ValueError):
        raise exc

    result = await db.execute(
        select(User)
        .options(joinedload(User.tenant), selectinload(User.roles))
        .where(User.id == user_uuid)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise exc
    if _token_is_revoked(payload, user):
        raise exc
    # Keep tenant suspension enforced even for inactive users
    if user.tenant is not None and not user.tenant.is_active:
        raise exc
    return user


CurrentUserAllowInactive = Annotated[User, Depends(_get_current_user_allow_inactive)]


async def _get_current_user_allow_inactive_and_suspended(
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
        token: str = credentials.credentials
        payload = decode_access_token(token)
        if payload.get("type") != "access":
            raise exc
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise exc
        user_uuid = UUID(user_id)
    except (JWTError, ValueError):
        raise exc

    # Tenant is eager-loaded here too, even though this variant runs no tenant
    # check: keeping `current_user.tenant` loaded across all three avoids a
    # MissingGreenlet that would surface on only some endpoints.
    result = await db.execute(
        select(User)
        .options(joinedload(User.tenant), selectinload(User.roles))
        .where(User.id == user_uuid)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise exc
    if _token_is_revoked(payload, user):
        raise exc
    return user


CurrentUserAllowInactiveAndSuspended = Annotated[
    User,
    Depends(_get_current_user_allow_inactive_and_suspended),
]


def require_platform_admin(current_user: CurrentUser) -> User:
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


PlatformAdmin = Annotated[User, Depends(require_platform_admin)]


def require_tenant_admin(current_user: CurrentUser) -> User:
    has_role = any(
        r.role in ("tenant_admin", "vendor")
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
    """
    Extract and validate bearer token from:
      1. ?token=<jwt> query parameter (browser WS clients can't set headers)
      2. Authorization: Bearer <jwt> header (server / mobile clients)
    """
    # Try query param first (browser WS)
    token = websocket.query_params.get("token")

    # Fall back to Authorization header
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        return None

    try:
        payload = decode_access_token(token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub", "")
        if not user_id:
            return None
        user_uuid = UUID(user_id)
        result = await db.execute(
            select(User)
            .options(joinedload(User.tenant), selectinload(User.roles))
            .where(User.id == user_uuid)
        )
        user = result.scalar_one_or_none()
        if user is None or not user.is_active or _token_is_revoked(payload, user):
            return None
        return user
    except (JWTError, ValueError):
        return None
