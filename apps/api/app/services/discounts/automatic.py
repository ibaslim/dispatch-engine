"""Discounts that apply to an order by themselves.

An automatic discount is an ordinary Discount row with `trigger = automatic`.
It applies when the order's pickup falls on its schedule, it is live, and its
limits allow. Nobody has to tick it, but a dispatcher can opt an order out of it
-- the opt-outs are stored on the order so later edits don't bring it back.

When several qualify, the one that takes the most off wins: automatic offers
don't stack with each other, only with a discount a dispatcher picks by hand.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.discount import Discount, DiscountStatus, DiscountTrigger
from app.services.discounts import schedule as schedule_rules
from app.services.discounts.engine import ZERO, amount_for
from app.services.discounts.mechanics import quantize


async def eligible_automatic(
    db: AsyncSession,
    *,
    pickup_at: datetime,
    pickup_time_specified: bool = True,
    now: datetime | None = None,
    already_applied: Iterable[UUID] = (),
) -> list[Discount]:
    """Every automatic discount that could apply, before opt-outs and pricing.

    One the order already carries stays eligible after it is paused, ended or
    used up: it was valid when the order was booked. Its schedule still has to
    match, since that follows the pickup date.
    """
    kept = set(already_applied)
    now = now or datetime.now(timezone.utc)
    candidates = (
        await db.scalars(
            select(Discount)
            .options(joinedload(Discount.discount_type))
            .where(
                Discount.trigger == DiscountTrigger.automatic,
                or_(Discount.status == DiscountStatus.active, Discount.id.in_(kept)),
            )
            .order_by(Discount.created_at, Discount.title)
        )
    ).all()

    eligible: list[Discount] = []
    for discount in candidates:
        if discount.id in kept:
            if schedule_rules.matches(discount.schedule, pickup_at, pickup_time_specified):
                eligible.append(discount)
            continue
        if discount.starts_at and discount.starts_at > now:
            continue
        if discount.ends_at and discount.ends_at <= now:
            continue
        if not schedule_rules.matches(discount.schedule, pickup_at, pickup_time_specified):
            continue
        if (
            discount.usage_limit_total is not None
            and discount.redemption_count >= discount.usage_limit_total
        ):
            continue
        eligible.append(discount)
    return eligible


def choose_best(
    eligible: Iterable[Discount],
    gross_fee: Decimal,
    opted_out: Iterable[UUID] = (),
) -> Discount | None:
    """The offer that takes the most off the fee; the earlier one wins a tie."""
    skipped = set(opted_out)
    best: Discount | None = None
    best_amount = ZERO
    for discount in eligible:
        if discount.id in skipped:
            continue
        amount = amount_for(discount, quantize(gross_fee))
        if amount > best_amount:
            best, best_amount = discount, amount
    return best


def as_uuids(values: Iterable[object] | None) -> list[UUID]:
    """Opt-outs arrive as strings from the JSON column and UUIDs from a request."""
    parsed: list[UUID] = []
    for value in values or []:
        try:
            parsed.append(value if isinstance(value, UUID) else UUID(str(value)))
        except (TypeError, ValueError):
            continue
    return parsed
