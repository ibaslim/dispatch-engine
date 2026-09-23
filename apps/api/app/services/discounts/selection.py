"""Loads the discounts chosen for an order, refusing any that can't be given.

Every check names the discount it rejected, so a dispatcher is told which one to
drop rather than being handed a failed save.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import (
    Discount,
    DiscountKind,
    DiscountStatus,
    DiscountTrigger,
    DiscountValueMode,
)
from app.services.discounts import schedule as schedule_rules


@dataclass(frozen=True)
class DiscountChoice:
    """One discount picked on an order, with the value typed for it if any."""

    discount_id: UUID
    value: Decimal | None = None

    @classmethod
    def parse(cls, raw: object) -> "DiscountChoice":
        """Accepts one of these, a {"discount_id", "value"} dict, or a bare id."""
        if isinstance(raw, cls):
            return raw
        if isinstance(raw, dict):
            discount_id = raw.get("discount_id") or raw.get("id")
            value = raw.get("value")
        else:
            discount_id, value = raw, None
        try:
            parsed_id = UUID(str(discount_id))
        except (TypeError, ValueError) as exc:
            raise DiscountSelectionError("A selected discount is not valid.") from exc
        if value is None or str(value).strip() == "":
            return cls(parsed_id, None)
        try:
            return cls(parsed_id, Decimal(str(value)))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise DiscountSelectionError("Enter a number for the discount amount.") from exc


class DiscountSelectionError(Exception):
    """A chosen discount can't be applied. The message names it."""

    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _check_entered_value(discount: Discount, value: Decimal | None) -> None:
    """A discount whose value is typed on the order needs that value to be sane."""
    if discount.value_mode != DiscountValueMode.entered:
        return
    if value is None:
        raise DiscountSelectionError(f"Enter an amount for {discount.title}.")
    if value <= 0:
        raise DiscountSelectionError(f"{discount.title} must be more than 0.")
    if discount.kind == DiscountKind.percentage and value > 100:
        raise DiscountSelectionError(f"{discount.title} cannot be more than 100%.")


async def load_selected(
    db: AsyncSession,
    choices: list[object],
    *,
    now: datetime | None = None,
    pickup_at: datetime | None = None,
    pickup_time_specified: bool = True,
    already_applied: set[UUID] | None = None,
) -> tuple[list[Discount], dict[UUID, Decimal]]:
    """The chosen discounts and their entered values, or a naming error.

    A discount already on the order was valid when it was given, so ending,
    pausing or using it up later doesn't block editing the order. Only its
    schedule is re-checked, since that follows the pickup date.
    """
    already_applied = already_applied or set()
    parsed = [DiscountChoice.parse(choice) for choice in (choices or [])]
    by_id: dict[UUID, DiscountChoice] = {}
    for choice in parsed:
        by_id.setdefault(choice.discount_id, choice)
    wanted = list(by_id)
    if not wanted:
        return [], {}

    now = now or datetime.now(timezone.utc)
    found = {
        discount.id: discount
        for discount in (await db.scalars(select(Discount).where(Discount.id.in_(wanted)))).all()
    }

    selected: list[Discount] = []
    entered: dict[UUID, Decimal] = {}
    for discount_id in wanted:
        discount = found.get(discount_id)
        if discount is None:
            raise DiscountSelectionError("A selected discount no longer exists.")
        name = discount.title
        if discount.trigger != DiscountTrigger.manual:
            raise DiscountSelectionError(f"{name} is applied automatically.")
        if discount_id in already_applied:
            if pickup_at is not None and not schedule_rules.matches(
                discount.schedule, pickup_at, pickup_time_specified
            ):
                raise DiscountSelectionError(
                    f"{name} only applies on "
                    f"{schedule_rules.describe(discount.schedule).lower()}."
                )
            _check_entered_value(discount, by_id[discount_id].value)
            if by_id[discount_id].value is not None:
                entered[discount_id] = by_id[discount_id].value
            selected.append(discount)
            continue
        if discount.status != DiscountStatus.active:
            raise DiscountSelectionError(f"{name} is not active.")
        if discount.starts_at and discount.starts_at > now:
            raise DiscountSelectionError(f"{name} has not started yet.")
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
        _check_entered_value(discount, by_id[discount_id].value)
        if by_id[discount_id].value is not None:
            entered[discount_id] = by_id[discount_id].value
        selected.append(discount)
    return selected, entered


def selected_choices(lines: list[dict] | None) -> list[DiscountChoice]:
    """The manual discounts already on an order, with the values they were given.

    Automatic and coupon-unlocked lines are left out: they are re-decided by
    their own rules each time, not carried over as if a dispatcher picked them.
    """
    choices: list[DiscountChoice] = []
    for line in lines or []:
        raw = line.get("discount_id")
        if not raw or line.get("source") in ("automatic", "code"):
            continue
        try:
            choices.append(DiscountChoice(UUID(str(raw)), Decimal(str(line.get("value") or 0))))
        except (TypeError, ValueError, InvalidOperation):
            continue
    return choices


def already_applied_ids(lines: list[dict] | None) -> set[UUID]:
    return {choice.discount_id for choice in selected_choices(lines)}


def automatic_applied_ids(lines: list[dict] | None) -> set[UUID]:
    """The automatic discounts an order already carries."""
    ids: set[UUID] = set()
    for line in lines or []:
        raw = line.get("discount_id")
        if raw and line.get("source") == "automatic":
            try:
                ids.add(UUID(str(raw)))
            except (TypeError, ValueError):
                continue
    return ids


def orphan_lines(lines: list[dict] | None) -> list[dict]:
    """Lines with no discount row behind them, kept as they are."""
    return [line for line in (lines or []) if not line.get("discount_id")]
