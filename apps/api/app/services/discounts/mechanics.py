"""Money math for the discount kinds. Pure functions, no I/O."""
from decimal import Decimal, ROUND_HALF_UP

MONEY = Decimal("0.01")

PERCENTAGE = "percentage"
FIXED_AMOUNT = "fixed_amount"


def quantize(amount: Decimal) -> Decimal:
    return amount.quantize(MONEY, rounding=ROUND_HALF_UP)


def percentage_amount(base: Decimal, percent: Decimal) -> Decimal:
    return quantize(base * percent / Decimal("100"))


def capped(amount: Decimal, ceiling: Decimal) -> Decimal:
    """Never negative, never more than the fee the discount comes off."""
    return max(Decimal("0.00"), min(quantize(amount), quantize(ceiling)))


def discount_amount(kind: str, value: Decimal, eligible: Decimal) -> Decimal:
    """What `kind` takes off `eligible`, capped at it."""
    eligible = quantize(eligible)
    raw = percentage_amount(eligible, value) if kind == PERCENTAGE else value
    return capped(raw, eligible)
