from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.security import generate_secure_token, hash_password
from app.models.invitation import Invitation
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.schemas.auth import TokenResponse
from app.services.auth_service import create_token_pair
from app.workers.tasks import send_invitation_email


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
        role="tenant_admin",
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
                f"{settings.dispatcher_web_base_url}/invite/accept?token={token}"
            ),
        )
    except Exception:
        pass  # Don't fail if Celery is unavailable

    return invitation


async def accept_invitation(
    db: AsyncSession,
    token: str,
    password: str,
    name: Optional[str],
) -> Optional[TokenResponse]:
    """
    Accept an invitation: validate token, create user, return token pair.
    Returns None if token is invalid or expired.
    """
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None or not invitation.is_valid():
        return None

    # Create user
    user = User(
        email=invitation.email,
        name=name or invitation.name or invitation.email.split("@")[0],
        hashed_password=hash_password(password),
        tenant_id=invitation.tenant_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Assign role
    user_role = UserRole(user_id=user.id, role=invitation.role)
    db.add(user_role)

    # Mark invitation as used
    invitation.is_used = True
    invitation.accepted_at = datetime.now(timezone.utc)
    db.add(invitation)

    await db.commit()
    await db.refresh(user)
    user.roles  # eager-ish load

    return await create_token_pair(db, user)
