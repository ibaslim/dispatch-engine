import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from typing import Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import joinedload

from app.core.security import (
    verify_password,
    create_access_token,
    generate_secure_token,
)
from app.core.config import settings
from app.models.user import User
from app.models.token import PushToken, RefreshToken
from app.models.onboarding_application import OnboardingApplication, ApplicationStatus
from app.schemas.auth import TokenResponse, PendingApprovalResponse, SuspendedAccountResponse
from app.models.tenant import Tenant, TenantRole


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def _is_tenant_suspended(db: AsyncSession, user: User) -> bool:
    if not user.tenant_id:
        return False

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    return tenant is not None and not tenant.is_active


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
) -> Union[User, PendingApprovalResponse, SuspendedAccountResponse, None]:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None

    # Allow login for suspended tenants so frontend can route to suspension screen.
    if await _is_tenant_suspended(db, user):
        tokens = await create_token_pair(db, user)
        return SuspendedAccountResponse(
            status="suspended",
            message="Your account is suspended. Please contact support.",
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
        )

    # Check for pre-pending and pending
    app_result = await db.execute(
        select(OnboardingApplication).where(
            OnboardingApplication.user_id == user.id
        )
    )
    app = app_result.scalar_one_or_none()

    if app is not None:
        if app.status == ApplicationStatus.pending:
            tokens = await create_token_pair(db, user)
            return PendingApprovalResponse(
                status="pending",
                message="Your account is pending approval from an administrator.",
                role=app.role.value if hasattr(app.role, 'value') else str(app.role),
                access_token=tokens.access_token,
                refresh_token=tokens.refresh_token,
            )
        if app.status == ApplicationStatus.pre_pending:
            tokens = await create_token_pair(db, user)
            return PendingApprovalResponse(
                status="pre_pending",
                message="Please complete your onboarding process.",
                role=app.role.value if hasattr(app.role, 'value') else str(app.role),
                access_token=tokens.access_token,
                refresh_token=tokens.refresh_token,
            )

    if not user.is_active:
        # Auto-activate if approved
        approved_result = await db.execute(
            select(OnboardingApplication).where(
                OnboardingApplication.user_id == user.id,
                OnboardingApplication.status == ApplicationStatus.approved,
            )
        )
        if approved_result.scalar_one_or_none() is not None:
            user.is_active = True
            db.add(user)
            await db.commit()
            await db.refresh(user)

    return user

async def create_token_pair(
    db: AsyncSession, user: User, new_session: bool = True
) -> TokenResponse:
    # if driver, then on new login, previous sessions must be revoked
    if new_session:
        await revoke_sessions_if_driver(db, user.id)

    # Get onboarding status
    app_result = await db.execute(
        select(OnboardingApplication)
        .where(OnboardingApplication.user_id == user.id)
    )
    app = app_result.scalar_one_or_none()

    extra_claims = {
        "onboarding_status": app.status.value if app else None,
        "tenant_role": None,
    }

    # Get tenant role if user belongs to a tenant
    if user.tenant_id:
        tenant_result = await db.execute(
            select(Tenant).where(Tenant.id == user.tenant_id)
        )
        tenant = tenant_result.scalar_one_or_none()

        if tenant and tenant.role:
            extra_claims["tenant_role"] = tenant.role.value

    # Create access token with extra claims
    access_token = create_access_token(
        str(user.id),
        extra_claims=extra_claims,
    )

    # Generate refresh token
    raw_refresh = generate_secure_token(64)
    token_hash = _hash_token(raw_refresh)

    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )

    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )

    db.add(refresh_record)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
    )

async def refresh_access_token(db: AsyncSession, raw_refresh: str) -> TokenResponse | None:
    token_hash = _hash_token(raw_refresh)
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    )
    record = result.scalar_one_or_none()
    if record is None or not record.is_valid():
        return None

    user_result = await db.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        return None
    if await _is_tenant_suspended(db, user):
        return None
    if not user.is_active:
        pending_result = await db.execute(
            select(OnboardingApplication).where(
                OnboardingApplication.user_id == user.id,
                OnboardingApplication.status.in_(
                    [ApplicationStatus.pre_pending, ApplicationStatus.pending]
                ),
            )
        )
        if pending_result.scalar_one_or_none() is None:
            return None

    # Rotate refresh token while the existing row is locked.
    record.is_revoked = True
    db.add(record)

    # Continuing an existing session, so it must not revoke itself.
    return await create_token_pair(db, user, new_session=False)


async def revoke_refresh_token(db: AsyncSession, raw_refresh: str) -> uuid.UUID | None:
    """Revoke one refresh token. Returns its owner, or None if unknown."""
    token_hash = _hash_token(raw_refresh)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if not record:
        return None
    record.is_revoked = True
    db.add(record)
    await db.commit()
    return record.user_id


async def revoke_sessions_if_driver(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Drivers hold one session at a time across web, Android and iOS.

    Called at login (before the new token is issued) and at logout. Other tenant
    roles may legitimately hold several sessions, so they are left alone.
    """
    user = await db.scalar(
        select(User).options(joinedload(User.tenant)).where(User.id == user_id)
    )
    if user is None or user.tenant is None or user.tenant.role != TenantRole.driver:
        return False

    await revoke_user_sessions(db, user_id)
    return True


async def revoke_user_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Sign a user out everywhere: access, refresh and push tokens.

    Stamping tokens_valid_from is what makes outstanding access tokens stop
    working immediately instead of lasting out their 15 minutes.
    """
    now = datetime.now(timezone.utc)

    await db.execute(
        sa_update(User).where(User.id == user_id).values(tokens_valid_from=now)
    )
    await db.execute(
        sa_update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked.is_(False))
        .values(is_revoked=True)
    )
    # A device with no session must stop receiving offers.
    await db.execute(
        sa_update(PushToken)
        .where(PushToken.user_id == user_id, PushToken.is_active.is_(True))
        .values(is_active=False)
    )
    await db.commit()
