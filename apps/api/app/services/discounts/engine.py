"""Turns discount inputs into the lines stored on an order.

This phase prices manual discounts only -- a dispatcher applying a percentage
or a fixed amount with a reason. Automatic promotions and coupon codes produce
the same lines through the same cap, so they slot in beside `apply_manual`.

The cap is the rule that matters: discounts only ever come off the platform's
delivery fee, never the goods value, taxes or tip that are passed on.
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

from app.services.discounts.mechanics import PERCENTAGE, discount_amount, quantize

MANUAL = "manual"


@dataclass(frozen=True)
class AppliedDiscount:
    """One priced discount line, as stored on the order and shown on receipts."""

    source: str
    kind: str
    label: str
    value: Decimal
    amount: Decimal
    reason: str | None = None
    note: str | None = None
    applied_by: UUID | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
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


def _label(kind: str, value: Decimal) -> str:
    return f"Discount ({_trim(value)}%)" if kind == PERCENTAGE else "Discount"


def apply_manual(
    manual: Any,
    gross_fee: Decimal,
    applied_by: UUID | None = None,
) -> list[AppliedDiscount]:
    """Price the one discount a dispatcher sets by hand, capped at the fee."""
    if manual is None:
        return []
    kind = _enum_value(manual.kind)
    value = Decimal(str(manual.value))
    amount = discount_amount(kind, value, quantize(gross_fee))
    if amount <= 0:
        return []
    return [
        AppliedDiscount(
            source=MANUAL,
            kind=kind,
            label=_label(kind, value),
            value=value,
            amount=amount,
            reason=_enum_value(manual.reason) or None,
            note=manual.note,
            applied_by=applied_by,
        )
    ]


def as_dicts(lines: Iterable[AppliedDiscount]) -> list[dict[str, Any]]:
    return [line.as_dict() for line in lines]


def reprice(lines: Iterable[dict[str, Any]] | None, gross_fee: Decimal) -> list[dict[str, Any]]:
    """Re-apply stored lines to a new delivery fee, keeping their own terms.

    An edited order can change the fee (new address, category or surcharges), so
    a percentage line has to follow it and a fixed line may need capping down.
    """
    remaining = quantize(gross_fee)
    repriced: list[dict[str, Any]] = []
    for line in lines or []:
        kind = str(line.get("kind") or "")
        raw_value = line.get("value")
        value = Decimal(str(raw_value if raw_value is not None else line.get("amount") or 0))
        amount = discount_amount(kind, value, remaining)
        if amount <= 0:
            continue
        repriced.append({**line, "amount": float(amount)})
        remaining = quantize(remaining - amount)
    return repriced


def total_of(lines: Iterable[dict[str, Any]] | None) -> Decimal:
    total = Decimal("0.00")
    for line in lines or []:
        try:
            total += Decimal(str(line.get("amount") or 0))
        except (TypeError, ValueError, ArithmeticError):
            continue
    return quantize(total)
