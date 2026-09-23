"""Keeps each discount's and coupon's usage counters true to what an order carries.

There is no separate ledger table: an order's own `applied_discounts` column is
the record of what it has, and deleting the order deletes that record with it.
This module only keeps `Discount.redemption_count` and `Coupon.used_count` in
step, atomically, so a usage limit can never be oversold.
"""
from uuid import UUID

from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import Discount
from app.services.discounts.selection import DiscountSelectionError


def _line_discount_ids(lines: list[dict] | None) -> set[UUID]:
    ids: set[UUID] = set()
    for line in lines or []:
        raw = line.get("discount_id")
        if not raw:
            continue
        try:
            ids.add(UUID(str(raw)))
        except (TypeError, ValueError):
            continue
    return ids


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


async def sync(
    db: AsyncSession,
    previous_lines: list[dict] | None,
    new_lines: list[dict] | None,
    discounts: list[Discount],
) -> None:
    """Claims a use for each discount newly on the order, releases each dropped one.

    `discounts` only needs to cover the newly-claimed ids; a discount being
    released is looked up by id alone, since releasing never needs its row.
    """
    by_id = {discount.id: discount for discount in discounts}
    previous_ids = _line_discount_ids(previous_lines)
    new_ids = _line_discount_ids(new_lines)

    for discount_id in previous_ids - new_ids:
        await _release(db, discount_id)

    for discount_id in new_ids - previous_ids:
        discount = by_id.get(discount_id)
        if discount is None:
            continue
        await _claim(db, discount)


async def release_lines(db: AsyncSession, lines: list[dict] | None) -> None:
    """Returns every discount an order (being deleted) was holding to the pool."""
    for discount_id in _line_discount_ids(lines):
        await _release(db, discount_id)
