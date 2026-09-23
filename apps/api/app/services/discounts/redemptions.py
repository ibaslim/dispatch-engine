"""Records which discount was used on which order, and keeps the counters true.

A redemption row outlives its order: the order id is cleared on delete but the
row stays, so usage limits, the per-reason report and the audit trail survive.
"""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import (
    Discount,
    DiscountRedemption,
    DiscountTrigger,
    RedemptionStatus,
)
from app.models.order import Order
from app.services.discounts.selection import DiscountSelectionError


def _snapshot(discount: Discount) -> dict:
    """The terms as they stood, so editing the discount can't rewrite history."""
    return {
        "title": discount.title,
        "public_label": discount.public_label,
        "kind": getattr(discount.kind, "value", discount.kind),
        "value": str(discount.value),
        "max_discount_amount": (
            str(discount.max_discount_amount) if discount.max_discount_amount is not None else None
        ),
        "min_gross_fee": (
            str(discount.min_gross_fee) if discount.min_gross_fee is not None else None
        ),
        "min_net_fee": str(discount.min_net_fee),
        "discount_type_id": str(discount.discount_type_id) if discount.discount_type_id else None,
    }


async def _claim(db: AsyncSession, discount: Discount) -> None:
    """Take one use, or refuse. Conditional so two orders can't take the last."""
    result = await db.execute(
        update(Discount)
        .where(
            Discount.id == discount.id,
            or_(
                Discount.usage_limit_total.is_(None),
                Discount.redemption_count < Discount.usage_limit_total,
            ),
        )
        .values(redemption_count=Discount.redemption_count + 1)
    )
    if result.rowcount == 0:
        raise DiscountSelectionError(f"{discount.title} has reached its usage limit.")


async def _release(db: AsyncSession, discount_id: UUID) -> None:
    await db.execute(
        update(Discount)
        .where(Discount.id == discount_id, Discount.redemption_count > 0)
        .values(redemption_count=Discount.redemption_count - 1)
    )


async def live_redemptions(db: AsyncSession, order_id: UUID) -> list[DiscountRedemption]:
    return list(
        (
            await db.scalars(
                select(DiscountRedemption).where(
                    DiscountRedemption.order_id == order_id,
                    DiscountRedemption.status == RedemptionStatus.applied,
                )
            )
        ).all()
    )


async def void(
    db: AsyncSession,
    redemption: DiscountRedemption,
    reason: str,
) -> None:
    redemption.status = RedemptionStatus.voided
    redemption.voided_at = datetime.now(timezone.utc)
    redemption.voided_reason = reason
    await _release(db, redemption.discount_id)


async def void_for_order(db: AsyncSession, order_id: UUID, reason: str) -> None:
    for redemption in await live_redemptions(db, order_id):
        await void(db, redemption, reason)


async def sync(
    db: AsyncSession,
    order: Order,
    lines: list[dict],
    discounts: list[Discount],
    *,
    applied_by: UUID | None = None,
    coupon_ids: dict[UUID, UUID] | None = None,
) -> None:
    """Make the order's redemptions match the lines it now carries.

    Kept discounts have their amount refreshed, dropped ones are voided, and new
    ones claim a use. Runs in the caller's transaction, with the order itself.
    `coupon_ids` names the code behind a discount, when one triggered it.
    """
    coupon_ids = coupon_ids or {}
    by_id = {discount.id: discount for discount in discounts}
    amounts: dict[UUID, Decimal] = {}
    notes: dict[UUID, str | None] = {}
    for line in lines:
        raw_id = line.get("discount_id")
        if not raw_id:
            continue
        discount_id = UUID(str(raw_id))
        amounts[discount_id] = Decimal(str(line.get("amount") or 0))
        notes[discount_id] = line.get("note")

    existing = {
        redemption.discount_id: redemption
        for redemption in await live_redemptions(db, order.id)
    }

    for discount_id, redemption in existing.items():
        if discount_id not in amounts:
            await void(db, redemption, "no_longer_applied")

    for discount_id, amount in amounts.items():
        redemption = existing.get(discount_id)
        if redemption is not None:
            redemption.amount = amount
            redemption.note = notes.get(discount_id)
            redemption.order_number = order.order_number
            continue
        discount = by_id.get(discount_id)
        if discount is None:
            continue
        await _claim(db, discount)
        db.add(
            DiscountRedemption(
                discount_id=discount.id,
                coupon_id=coupon_ids.get(discount_id),
                order_id=order.id,
                order_number=order.order_number,
                tenant_id=order.vendor_id,
                source=discount.trigger,
                amount=amount,
                status=RedemptionStatus.applied,
                reason=getattr(discount.reason, "value", discount.reason),
                note=notes.get(discount_id),
                applied_by=applied_by if discount.trigger == DiscountTrigger.manual else None,
                snapshot=_snapshot(discount),
            )
        )
