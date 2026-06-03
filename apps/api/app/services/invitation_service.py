from datetime import datetime, timedelta, timezone
from typing import Union, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.config import settings
from app.core.security import generate_secure_token, hash_password
from app.models.invitation import Invitation
from app.models.user import User, RoleEnum
from app.models.tenant import Tenant
from app.models.onboarding_application import OnboardingApplication, ApplicationStatus
from app.schemas.auth import TokenResponse, PendingApprovalResponse
from app.services.auth_service import create_token_pair
from app.workers.tasks import send_invitation_email
import logging

logger = logging.getLogger(__name__)
from urllib.parse import quote


def _slugify(name: str) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug


async def create_tenant_admin_invitation(
    db: AsyncSession,
    email: str,
    name: str,
    tenant_name: str,
    invited_by: User,
) -> Invitation:
    """
    Create a new tenant + invitation for tenant admin onboarding.
    Platform admin only.
    """
    # Create (or find existing) tenant
    slug = _slugify(tenant_name)
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        tenant = Tenant(name=tenant_name, slug=slug)
        db.add(tenant)
        await db.flush()

    token = generate_secure_token(32)
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.invitation_token_expire_hours
    )

    invitation = Invitation(
        email=email.lower(),
        name=name,
        token=token,
        role=RoleEnum.vendor.value,
        tenant_id=tenant.id,
        tenant_name=tenant_name,
        expires_at=expires_at,
        invited_by_id=invited_by.id,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    # Enqueue email task (fire-and-forget)
    try:
        send_invitation_email.delay(
            email=email,
            name=name,
            tenant_name=tenant_name,
            invite_token=token,
            accept_url=(
                f"{settings.dispatcher_web_base_url}/invite/accept?token={quote(token)}&role={RoleEnum.vendor.value}"
            ),
            role="tenant admin",
        )
    except Exception:
        pass  # Don't fail if Celery is unavailable

    return invitation


def _normalize_invite_role(role: str) -> str:
    normalized = role.strip().lower().replace(" ", "_")
    mapping = {
        "admin": RoleEnum.vendor.value,
        "tenant_admin": RoleEnum.vendor.value,
        "vendor": RoleEnum.vendor.value,
        "driver": RoleEnum.driver.value,
        "individual": RoleEnum.individual.value,
    }
    if normalized not in mapping:
        raise ValueError("Unsupported role.")
    return mapping[normalized]



async def create_tenant_user_invitation(
    db: AsyncSession,
    email: str,
    role: str,
    invited_by: User,
) -> Invitation:
    result = await db.execute(
        select(User)
        .options(selectinload(User.tenant))
        .where(User.id == invited_by.id)
    )
    inviter = result.scalar_one_or_none()
    if inviter is None:
        raise ValueError("Inviting user not found.")

    tenant = inviter.tenant
    if inviter.tenant_id and tenant is None:
        raise ValueError("Tenant not found.")

    normalized_role = _normalize_invite_role(role)

    token = generate_secure_token(32)
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.invitation_token_expire_hours
    )

    invitation = Invitation(
        email=email.lower(),
        name=email.split("@")[0],
        token=token,
        role=normalized_role,
        tenant_id=tenant.id if tenant else None,
        tenant_name=tenant.name if tenant else None,
        expires_at=expires_at,
        invited_by_id=invited_by.id,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    try:
        tenant_name_for_email = tenant.name if tenant else "Dispatch Engine"
        send_invitation_email.delay(
            email=email,
            name=invitation.name,
            tenant_name=tenant_name_for_email,
            invite_token=token,
            accept_url=(
                f"{settings.dispatcher_web_base_url}/invite/accept?token={quote(token)}&role={normalized_role}"
            ),
            role=normalized_role,
        )
    except Exception:
        pass

    return invitation


async def accept_invitation(
    db: AsyncSession,
    token: str,
    password: str,
    name: Optional[str],
    username: Optional[str] = None,
) -> Union[TokenResponse, PendingApprovalResponse, None]:
    """
    Accept an invitation: validate token, create onboarding application (pre-pending).
    Returns TokenResponse with onboarding access tokens, or None if token is invalid or expired.
    """
    # Log a short preview of the token for debugging (avoid logging full token in production)
    if token:
        preview = (token[:8] + '...' + token[-8:]) if len(token) > 16 else token
        logger.info("accept_invitation: token preview=%s len=%d", preview, len(token))

    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    # Fallbacks for common token mangling (e.g. '+' <-> ' ' issues from forms/clients)
    if invitation is None:
        if ' ' in token:
            alt = token.replace(' ', '+')
            logger.info('accept_invitation: trying token with spaces->plus preview=%s', (alt[:8] + '...' + alt[-8:]) if len(alt) > 16 else alt)
            result = await db.execute(select(Invitation).where(Invitation.token == alt))
            invitation = result.scalar_one_or_none()
        if invitation is None and '+' in token:
            alt2 = token.replace('+', ' ')
            logger.info('accept_invitation: trying token with plus->space preview=%s', (alt2[:8] + '...' + alt2[-8:]) if len(alt2) > 16 else alt2)
            result = await db.execute(select(Invitation).where(Invitation.token == alt2))
            invitation = result.scalar_one_or_none()

    if invitation is None:
        return None

    existing_user_result = await db.execute(
        select(User).where(User.email == invitation.email.lower())
    )
    existing_user = existing_user_result.scalar_one_or_none()

    if invitation.is_used:
        if existing_user is None:
            return None
        pending_result = await db.execute(
            select(OnboardingApplication).where(
                OnboardingApplication.user_id == existing_user.id,
                OnboardingApplication.status.in_(
                    [ApplicationStatus.pre_pending, ApplicationStatus.pending]
                ),
            )
        )
        app = pending_result.scalar_one_or_none()
        if app is not None:
            tokens = await create_token_pair(db, existing_user)
            if app.status == ApplicationStatus.pre_pending:
                return PendingApprovalResponse(
                    status="pre_pending",
                    message="Please complete your onboarding process.",
                    role=app.role.value if hasattr(app.role, "value") else str(app.role),
                    access_token=tokens.access_token,
                    refresh_token=tokens.refresh_token,
                )
            return PendingApprovalResponse(
                status="pending",
                message="Your account is pending approval from an administrator.",
                role=app.role.value if hasattr(app.role, "value") else str(app.role),
                access_token=tokens.access_token,
                refresh_token=tokens.refresh_token,
            )
        return await create_token_pair(db, existing_user)

    if not invitation.is_valid():
        return None

    try:
        # Keep onboarding payload in application.data while account is pending approval.
        application_data = {
            "email": invitation.email,
            "name": name or invitation.name or invitation.email.split("@")[0],
            "password_hash": hash_password(password),
            "username": username,  # Store username for later use
        }

        if existing_user is None:
            existing_user = User(
                email=invitation.email,
                name=name or invitation.name or invitation.email.split("@")[0],
                hashed_password=application_data["password_hash"],
                tenant_id=invitation.tenant_id,
                is_active=False,
            )
            db.add(existing_user)
            await db.flush()
        else:
            existing_user.name = name or existing_user.name
            existing_user.hashed_password = application_data["password_hash"]
            existing_user.tenant_id = invitation.tenant_id
            existing_user.is_active = False
            db.add(existing_user)

        latest_app_result = await db.execute(
            select(OnboardingApplication)
            .where(OnboardingApplication.user_id == existing_user.id)
            .order_by(OnboardingApplication.created_at.desc())
        )
        latest_app = latest_app_result.scalars().first()
        if latest_app and latest_app.status in (ApplicationStatus.pre_pending, ApplicationStatus.pending):
            latest_app.role = invitation.role
            latest_app.data = application_data
            latest_app.reviewed_at = None
            latest_app.reviewed_by_id = None
            latest_app.decision_reason = None
            db.add(latest_app)
        else:
            db.add(
                OnboardingApplication(
                    user_id=existing_user.id,
                    role=invitation.role,
                    status=ApplicationStatus.pre_pending,
                    data=application_data,
                )
            )

        # Mark invitation as used
        invitation.is_used = True
        invitation.accepted_at = datetime.now(timezone.utc)
        db.add(invitation)

        await db.commit()
        logger.info("accept_invitation: pending onboarding application ready for %s", invitation.email)

        tokens = await create_token_pair(db, existing_user)
        return PendingApprovalResponse(
            status="pre_pending",
            message="Please complete your onboarding process.",
            role=invitation.role,
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
        )

    except Exception as e:
        logger.error("accept_invitation: error creating application: %s", str(e), exc_info=True)
        await db.rollback()
        return None
