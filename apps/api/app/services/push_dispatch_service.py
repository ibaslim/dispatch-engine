"""
Push fan-out: "notify these drivers" -> "send to these device tokens".

Offers go only to drivers on shift, and fail closed if presence can't be read —
pushing offers to off-shift drivers teaches them to mute the app. Assignments
ignore presence entirely.
"""
from __future__ import annotations

import logging
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant, TenantRole
from app.models.token import PushToken
from app.models.user import User
from app.services.driver_presence_service import DriverPresenceService
from app.services.fcm_service import fcm_service
from app.services.push_contract import PushEnvelope

logger = logging.getLogger(__name__)


async def _tokens_for_tenants(db: AsyncSession, tenant_ids: list[UUID]) -> list[str]:
    if not tenant_ids:
        return []
    rows = await db.execute(
        select(PushToken.token)
        .join(User, User.id == PushToken.user_id)
        .join(Tenant, Tenant.id == User.tenant_id)
        .where(
            User.tenant_id.in_(tenant_ids),
            User.is_active.is_(True),
            # Presence derives from driver:location:*, and POST /drivers/me/location
            # accepts any tenant. Without this, a non-driver tenant that posted a
            # location would be targeted by driver offer broadcasts.
            Tenant.role == TenantRole.driver,
            Tenant.is_active.is_(True),
            PushToken.is_active.is_(True),
        )
    )
    return [row[0] for row in rows.all()]


async def _tokens_for_user(db: AsyncSession, user_id: UUID) -> list[str]:
    rows = await db.execute(
        select(PushToken.token).where(
            PushToken.user_id == user_id, PushToken.is_active.is_(True)
        )
    )
    return [row[0] for row in rows.all()]


async def _reap(db: AsyncSession, dead_tokens: list[str]) -> None:
    if not dead_tokens:
        return
    await db.execute(
        update(PushToken).where(PushToken.token.in_(dead_tokens)).values(is_active=False)
    )
    await db.commit()
    logger.info("Deactivated %d dead push token(s)", len(dead_tokens))


async def send_envelope_to_tenants(
    db: AsyncSession, envelope: PushEnvelope, tenant_ids: list[UUID]
) -> int:
    tokens = await _tokens_for_tenants(db, tenant_ids)
    if not tokens:
        logger.info("Push %s: no active tokens", envelope.data.get("type"))
        return 0
    result = fcm_service.send_to_tokens(tokens, envelope)
    await _reap(db, result.dead_tokens)
    return result.success_count


async def notify_online_drivers(
    db: AsyncSession,
    redis: aioredis.Redis,
    envelope: PushEnvelope,
    *,
    exclude_tenant_ids: set[UUID] | None = None,
) -> int:
    try:
        online = await DriverPresenceService(redis).list_online_driver_ids()
    except Exception:
        # Fail closed — see module docstring.
        logger.exception("Presence lookup failed; suppressing push %s", envelope.data.get("type"))
        return 0

    excluded = exclude_tenant_ids or set()
    recipients = [tenant_id for tenant_id in online if tenant_id not in excluded]

    if not recipients:
        # A sustained run of these is the signature of a broken presence path,
        # which otherwise looks exactly like a quiet night.
        logger.info("Push %s: no drivers on shift", envelope.data.get("type"))
        return 0

    return await send_envelope_to_tenants(db, envelope, recipients)


async def notify_user(db: AsyncSession, envelope: PushEnvelope, user_id: UUID) -> int:
    tokens = await _tokens_for_user(db, user_id)
    if not tokens:
        return 0
    result = fcm_service.send_to_tokens(tokens, envelope)
    await _reap(db, result.dead_tokens)
    return result.success_count