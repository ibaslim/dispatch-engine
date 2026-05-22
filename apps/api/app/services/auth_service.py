import hashlib
from datetime import datetime, timedelta, timezone

from typing import Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import (
    verify_password,
    create_access_token,
    generate_secure_token,
)
from app.core.config import settings
from app.models.user import User
from app.models.token import RefreshToken
from app.models.onboarding_application import OnboardingApplication, ApplicationStatus
from app.schemas.auth import TokenResponse, PendingApprovalResponse, SuspendedAccountResponse
from app.models.tenant import Tenant


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


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
    if user.tenant_id:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        if tenant is not None and not tenant.is_active:
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

async def check_pending_approval(db: AsyncSession, email: str) -> PendingApprovalResponse | None:
    """Check if a user with given email has pending approval. Returns PendingApprovalResponse if pending."""
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        return None

    app_result = await db.execute(
        select(OnboardingApplication).where(
            OnboardingApplication.user_id == user.id,
            OnboardingApplication.status.in_([ApplicationStatus.pending, ApplicationStatus.pre_pending]),
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

    return None


async def create_token_pair(db: AsyncSession, user: User) -> TokenResponse:
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
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record is None or not record.is_valid():
        return None

    # Rotate refresh token
    record.is_revoked = True
    db.add(record)

    user_result = await db.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
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

    return await create_token_pair(db, user)


async def revoke_refresh_token(db: AsyncSession, raw_refresh: str) -> None:
    token_hash = _hash_token(raw_refresh)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record:
        record.is_revoked = True
        db.add(record)
        await db.commit()
