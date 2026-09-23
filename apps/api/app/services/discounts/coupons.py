"""Coupon codes: a customer-facing string that unlocks one discount.

A coupon carries no price logic of its own -- the discount it points at decides
the mechanic, the caps, the window and the schedule. The code only adds its own
use limit, an optional expiry and an optional owning tenant on top of that.
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import Coupon, Discount, DiscountStatus, DiscountTrigger
from app.services.discounts import schedule as schedule_rules
from app.services.discounts.selection import DiscountSelectionError, _tenant_use_count

# 0/O and 1/I are left out: too easy to mix up when read aloud or typed by hand.
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 10
MAX_BATCH_ATTEMPTS = 20


def normalize(code: str | None) -> str:
    return (code or "").strip().upper()


def generate_code(prefix: str | None = None) -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    stamp = normalize(prefix)
    return f"{stamp}{body}" if stamp else body


async def create_single(
    db: AsyncSession,
    *,
    discount_id: UUID,
    code: str,
    tenant_id: UUID | None,
    max_uses: int | None,
    expires_at: datetime | None,
    created_by: UUID | None,
) -> Coupon:
    """One code an admin types by hand: a public code, or one assigned to a tenant."""
    coupon = Coupon(
        discount_id=discount_id,
        code=normalize(code),
        max_uses=max_uses,
        tenant_id=tenant_id,
        expires_at=expires_at,
        created_by=created_by,
    )
    db.add(coupon)
    return coupon


async def create_batch(
    db: AsyncSession,
    *,
    discount_id: UUID,
    count: int,
    prefix: str | None,
    batch_label: str,
    expires_at: datetime | None,
    created_by: UUID | None,
) -> list[Coupon]:
    """Generates `count` single-use codes, retrying the shortfall from collisions.

    Inserted with ON CONFLICT DO NOTHING, so a clash with an existing code is
    silently dropped and regenerated rather than failing the whole batch.
    """
    created_ids: list[UUID] = []
    attempts = 0
    while len(created_ids) < count and attempts < MAX_BATCH_ATTEMPTS:
        attempts += 1
        shortfall = count - len(created_ids)
        rows = [
            {
                "id": uuid.uuid4(),
                "discount_id": discount_id,
                "code": generate_code(prefix),
                "max_uses": 1,
                "used_count": 0,
                "tenant_id": None,
                "expires_at": expires_at,
                "is_active": True,
                "batch_label": batch_label,
                "created_by": created_by,
            }
            for _ in range(shortfall)
        ]
        stmt = (
            pg_insert(Coupon)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["code"])
            .returning(Coupon.id)
        )
        result = await db.execute(stmt)
        created_ids.extend(row[0] for row in result.fetchall())
    if not created_ids:
        return []
    return list((await db.scalars(select(Coupon).where(Coupon.id.in_(created_ids)))).all())


async def validate(
    db: AsyncSession,
    code: str,
    *,
    tenant_id: UUID | None,
    order_id: UUID | None,
    pickup_at: datetime | None,
    pickup_time_specified: bool = True,
    now: datetime | None = None,
) -> tuple[Discount, Coupon]:
    """The discount a freshly entered code unlocks, or a naming error.

    Every failure has its own message, so a dispatcher knows what to fix
    rather than being handed a generic "invalid code".
    """
    normalized = normalize(code)
    if not normalized:
        raise DiscountSelectionError("Enter a code.")
    now = now or datetime.now(timezone.utc)

    coupon = await db.scalar(select(Coupon).where(Coupon.code == normalized))
    if coupon is None:
        raise DiscountSelectionError("This code doesn't exist.")
    if not coupon.is_active:
        raise DiscountSelectionError("This code has been deactivated.")
    if coupon.expires_at and coupon.expires_at <= now:
        raise DiscountSelectionError("This code has expired.")
    if coupon.tenant_id is not None and coupon.tenant_id != tenant_id:
        raise DiscountSelectionError("This code belongs to another account.")
    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise DiscountSelectionError("This code has already been used.")

    discount = await db.get(Discount, coupon.discount_id)
    if discount is None or discount.trigger != DiscountTrigger.code:
        raise DiscountSelectionError("This code no longer works.")
    name = discount.title
    if discount.status != DiscountStatus.active:
        raise DiscountSelectionError(f"{name} has ended.")
    if discount.starts_at and discount.starts_at > now:
        raise DiscountSelectionError(f"{name} hasn't started yet.")
    if discount.ends_at and discount.ends_at <= now:
        raise DiscountSelectionError(f"{name} has ended.")
    if pickup_at is not None and not schedule_rules.matches(
        discount.schedule, pickup_at, pickup_time_specified
    ):
        raise DiscountSelectionError(
            f"{name} only applies on {schedule_rules.describe(discount.schedule).lower()}."
        )
    if (
        discount.usage_limit_total is not None
        and discount.redemption_count >= discount.usage_limit_total
    ):
        raise DiscountSelectionError(f"{name} has reached its usage limit.")
    if discount.usage_limit_per_tenant is not None and tenant_id is not None:
        used = await _tenant_use_count(db, discount.id, tenant_id, order_id)
        if used >= discount.usage_limit_per_tenant:
            raise DiscountSelectionError(f"{name} has reached its limit for this customer.")

    return discount, coupon


def _coupon_line_discount_id(lines: Iterable[dict] | None) -> UUID | None:
    for line in lines or []:
        if line.get("source") == "code" and line.get("discount_id"):
            try:
                return UUID(str(line["discount_id"]))
            except (TypeError, ValueError):
                return None
    return None


async def carried_discount(
    db: AsyncSession,
    lines: Iterable[dict] | None,
    pickup_at: datetime | None,
    pickup_time_specified: bool = True,
) -> Discount | None:
    """The discount a coupon already on the order unlocked, kept if its schedule still fits.

    The coupon itself is not re-checked here: it was valid when the order was
    booked, and a code being used up or deactivated afterwards should not knock
    the discount off an order that already has it -- the same rule an ended
    promotion follows for a discount picked by hand.
    """
    discount_id = _coupon_line_discount_id(lines)
    if discount_id is None:
        return None
    discount = await db.get(Discount, discount_id)
    if discount is None:
        return None
    if pickup_at is not None and not schedule_rules.matches(
        discount.schedule, pickup_at, pickup_time_specified
    ):
        return None
    return discount


async def claim(db: AsyncSession, coupon: Coupon) -> None:
    """Take one use, or refuse. Conditional so two orders can't take the last one."""
    result = await db.execute(
        update(Coupon)
        .where(
            Coupon.id == coupon.id,
            or_(Coupon.max_uses.is_(None), Coupon.used_count < Coupon.max_uses),
        )
        .values(used_count=Coupon.used_count + 1)
    )
    if result.rowcount == 0:
        raise DiscountSelectionError("This code has already been used.")


async def release(db: AsyncSession, coupon_id: UUID) -> None:
    await db.execute(
        update(Coupon)
        .where(Coupon.id == coupon_id, Coupon.used_count > 0)
        .values(used_count=Coupon.used_count - 1)
    )


async def release_by_code(db: AsyncSession, code: str | None) -> None:
    normalized = normalize(code)
    if not normalized:
        return
    coupon = await db.scalar(select(Coupon).where(Coupon.code == normalized))
    if coupon is not None:
        await release(db, coupon.id)
