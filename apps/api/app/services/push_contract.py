"""
Push wire contract — server side. The only place a payload is built.

Mirrors libs/shared/contracts/src/push-contract.ts — change both together.

Rules: every data value is a string (FCM requires it); `route` is server-decided
so retargeting a notification is not an app release; no order details, ever —
push renders on a locked screen in public, so ids and generic copy only.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

# Keep in sync with push-contract.ts
PUSH_CONTRACT_VERSION = "1"

TYPE_OFFER_PUBLISHED = "offer_published"
TYPE_OFFER_REVOKED = "offer_revoked"
TYPE_ORDER_ASSIGNED = "order_assigned"
TYPE_ORDER_UPDATED = "order_updated"

# Versioned: an Android channel's importance is immutable once created.
PUSH_CATEGORY_OFFER = "order-offers-v1"

ACTION_DISMISS = "dismiss"
ACTION_DETAILS = "details"


@dataclass(frozen=True, slots=True)
class PushEnvelope:
    data: dict[str, str]
    title: str
    body: str
    ttl_seconds: int
    expires_at: datetime
    category: str
    silent: bool


def build_offer_published(
    *,
    order_id: UUID | str,
    expires_at: datetime,
    now: datetime | None = None,
) -> PushEnvelope:
    """New broadcast offer, for on-shift drivers."""
    now = now or datetime.now(timezone.utc)
    ttl = max(0, int((expires_at - now).total_seconds()))
    minutes_left = max(1, ttl // 60)
    title = "New delivery offer"
    body = f"Tap for details - expires in {minutes_left} min"

    return PushEnvelope(
        data={
            "v": PUSH_CONTRACT_VERSION,
            "type": TYPE_OFFER_PUBLISHED,
            "order_id": str(order_id),
            "route": f"/offer/{order_id}",
            "title": title,
            "body": body,
            "expires_at": expires_at.isoformat(),
            "category": PUSH_CATEGORY_OFFER,
        },
        title=title,
        body=body,
        ttl_seconds=ttl,
        expires_at=expires_at,
        category=PUSH_CATEGORY_OFFER,
        silent=False,
    )


def build_offer_revoked(*, order_id: UUID | str, now: datetime | None = None) -> PushEnvelope:
    """Clear an offer notification already on other drivers' phones."""
    now = now or datetime.now(timezone.utc)
    return PushEnvelope(
        data={
            "v": PUSH_CONTRACT_VERSION,
            "type": TYPE_OFFER_REVOKED,
            "order_id": str(order_id),
            "route": "",
            "title": "",
            "body": "",
            "expires_at": now.isoformat(),
            "category": PUSH_CATEGORY_OFFER,
            "silent": "1",
        },
        title="",
        body="",
        ttl_seconds=300,
        expires_at=now,
        category=PUSH_CATEGORY_OFFER,
        silent=True,
    )


def build_order_assigned(
    *,
    order_id: UUID | str,
    order_number: str | None,
    expires_at: datetime,
    now: datetime | None = None,
) -> PushEnvelope:
    """Direct assignment. Not presence-gated — the work is already theirs."""
    now = now or datetime.now(timezone.utc)
    ttl = max(0, int((expires_at - now).total_seconds()))
    label = f"Order #{order_number}" if order_number else "A new order"
    title = "New job assigned"
    body = f"{label} has been assigned to you"

    return PushEnvelope(
        data={
            "v": PUSH_CONTRACT_VERSION,
            "type": TYPE_ORDER_ASSIGNED,
            "order_id": str(order_id),
            "route": f"/job/{order_id}",
            "title": title,
            "body": body,
            "expires_at": expires_at.isoformat(),
            "category": PUSH_CATEGORY_OFFER,
        },
        title=title,
        body=body,
        ttl_seconds=ttl,
        expires_at=expires_at,
        category=PUSH_CATEGORY_OFFER,
        silent=False,
    )