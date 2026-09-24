"""Prices the discounts chosen for an order into the lines stored on it.

Two rules hold no matter what is selected:

* a discount only ever comes off the platform's delivery fee, so the running
  total can never exceed the gross fee -- the goods value, GST/PST and the tip
  are owed to the vendor and the driver;
* the server prices everything. A client sends ids, never amounts.

Coupon and automatic discounts join the same path later: they are Discount rows
too, so they only change which rows arrive here and in what order.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

from app.services.discounts.mechanics import PERCENTAGE, discount_amount, quantize

ZERO = Decimal("0.00")


@dataclass(frozen=True)
class AppliedDiscount:
    """One priced line, as stored on the order and shown on receipts."""

    source: str
    kind: str
    label: str
    value: Decimal
    amount: Decimal
    discount_id: UUID | None = None
    reason: str | None = None
    note: str | None = None
    applied_by: UUID | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "discount_id": str(self.discount_id) if self.discount_id else None,
            "source": self.source,
            "kind": self.kind,
            "label": self.label,
            "value": float(self.value),
            "amount": float(self.amount),
            "reason": self.reason,
            "note": self.note,
            "applied_by": str(self.applied_by) if self.applied_by else None,
        }


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "")


def _trim(value: Decimal) -> str:
    """15 -> "15", 12.50 -> "12.5". Only ever trims after a decimal point."""
    text = f"{value:f}"
    return (text.rstrip("0").rstrip(".") if "." in text else text) or "0"


def fallback_label(kind: str, value: Decimal) -> str:
    return f"Discount ({_trim(value)}%)" if kind == PERCENTAGE else "Discount"


def value_of(discount: Any, entered: Decimal | None = None) -> Decimal:
    """The value to price with: what was typed on the order, else the discount's own."""
    if _enum_value(discount.value_mode) == "entered" and entered is not None:
        return Decimal(str(entered))
    return Decimal(str(discount.value if discount.value is not None else 0))


def amount_for(
    discount: Any, remaining: Decimal, entered: Decimal | None = None
) -> Decimal:
    """What this discount takes off what is left of the fee, after its caps.

    `min_gross_fee` decides whether it applies at all; `max_discount_amount`
    bounds a percentage; `min_net_fee` keeps a floor under the platform's cut.
    """
    remaining = quantize(remaining)
    if remaining <= ZERO:
        return ZERO
    if discount.min_gross_fee is not None and remaining < Decimal(str(discount.min_gross_fee)):
        return ZERO

    amount = discount_amount(
        _enum_value(discount.kind), value_of(discount, entered), remaining
    )
    if discount.max_discount_amount is not None:
        amount = min(amount, quantize(Decimal(str(discount.max_discount_amount))))
    floor = quantize(Decimal(str(discount.min_net_fee or 0)))
    amount = min(amount, max(ZERO, remaining - floor))
    return max(ZERO, amount)


def price_discounts(
    discounts: Iterable[Any],
    gross_fee: Decimal,
    *,
    entered_values: dict[UUID, Decimal] | None = None,
    note: str | None = None,
    applied_by: UUID | None = None,
) -> list[AppliedDiscount]:
    """Price each discount in turn against what is left of the fee."""
    remaining = quantize(gross_fee)
    entered_values = entered_values or {}
    lines: list[AppliedDiscount] = []
    for discount in discounts:
        entered = entered_values.get(discount.id)
        amount = amount_for(discount, remaining, entered)
        if amount <= ZERO:
            continue
        manual = _enum_value(discount.trigger) in ("", "manual")
        lines.append(
            AppliedDiscount(
                discount_id=discount.id,
                source=_enum_value(discount.trigger) or "manual",
                kind=_enum_value(discount.kind),
                label=discount.public_label or discount.title,
                value=value_of(discount, entered),
                amount=amount,
                reason=_enum_value(discount.reason) or None,
                # The note and the admin belong to a hand-applied discount only.
                note=note if manual else None,
                applied_by=applied_by if manual else None,
            )
        )
        remaining = quantize(remaining - amount)
    return lines


def as_dicts(lines: Iterable[AppliedDiscount]) -> list[dict[str, Any]]:
    return [line.as_dict() for line in lines]


def reprice_orphans(
    lines: Iterable[dict[str, Any]] | None, remaining: Decimal
) -> list[dict[str, Any]]:
    """Re-cap lines that have no discount row behind them.

    Orders discounted before discounts became rows, and the backfill of the old
    free-text amounts, carry their own kind and value. They keep working: a
    percentage follows the fee, a fixed amount is capped down to it.
    """
    left = quantize(remaining)
    repriced: list[dict[str, Any]] = []
    for line in lines or []:
        kind = str(line.get("kind") or "")
        raw_value = line.get("value")
        value = Decimal(str(raw_value if raw_value is not None else line.get("amount") or 0))
        amount = discount_amount(kind, value, left)
        if amount <= ZERO:
            continue
        repriced.append({**line, "amount": float(amount)})
        left = quantize(left - amount)
    return repriced


def total_of(lines: Iterable[dict[str, Any]] | None) -> Decimal:
    total = ZERO
    for line in lines or []:
        try:
            total += Decimal(str(line.get("amount") or 0))
        except (TypeError, ValueError, ArithmeticError):
            continue
    return quantize(total)


def build_lines(
    *,
    gross_fee: Decimal,
    discounts: Iterable[Any] = (),
    entered_values: dict[UUID, Decimal] | None = None,
    orphan_lines: Iterable[dict[str, Any]] | None = None,
    note: str | None = None,
    applied_by: UUID | None = None,
) -> list[dict[str, Any]]:
    """Every line for an order, priced against one shared pool: the gross fee."""
    orphans = reprice_orphans(orphan_lines, gross_fee)
    remaining = quantize(gross_fee) - total_of(orphans)
    priced = price_discounts(
        discounts,
        remaining,
        entered_values=entered_values,
        note=note,
        applied_by=applied_by,
    )
    return [*orphans, *as_dicts(priced)]
