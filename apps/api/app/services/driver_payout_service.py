import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.driver_payment import (
    DriverPaymentGroup,
    DriverPaymentGroupAssignment,
)
from app.models.order import Order

MONEY = Decimal("0.01")


@dataclass(frozen=True)
class DriverPayout:
    total: Decimal
    delivery_fee: Decimal
    tip: Decimal
    rule_type: str | None


def calculate_driver_payout(
    group: DriverPaymentGroup | None,
    delivery_fee: float | Decimal | None,
    customer_tip: float | Decimal | None,
) -> DriverPayout:
    fee = Decimal(str(delivery_fee or 0))
    tip = Decimal(str(customer_tip or 0))
    fee_payout = Decimal("0")
    tip_payout = Decimal("0")

    if group is None:
        rule_type = None
    elif group.rule_type == "fixed":
        rule_type = group.rule_type
        fee_payout = Decimal(group.fixed_amount or 0)
    elif group.rule_type == "percentage":
        rule_type = group.rule_type
        fee_payout = fee * Decimal(group.delivery_fee_percentage or 0) / Decimal("100")
    elif group.rule_type == "passthrough":
        rule_type = group.rule_type
        fee_payout = fee * Decimal(group.delivery_fee_percentage or 0) / Decimal("100")
        driver_tip_percentage = Decimal("100") - Decimal(group.platform_tip_percentage or 0)
        tip_payout = tip * driver_tip_percentage / Decimal("100")
    else:
        rule_type = None

    fee_payout = fee_payout.quantize(MONEY, rounding=ROUND_HALF_UP)
    tip_payout = tip_payout.quantize(MONEY, rounding=ROUND_HALF_UP)
    return DriverPayout(
        total=(fee_payout + tip_payout).quantize(MONEY, rounding=ROUND_HALF_UP),
        delivery_fee=fee_payout,
        tip=tip_payout,
        rule_type=rule_type,
    )


async def get_driver_payment_group(
    db: AsyncSession,
    driver_id: uuid.UUID,
) -> DriverPaymentGroup | None:
    assignment = await db.scalar(
        select(DriverPaymentGroupAssignment)
        .where(DriverPaymentGroupAssignment.driver_id == driver_id)
        .options(joinedload(DriverPaymentGroupAssignment.group))
    )
    return assignment.group if assignment else None


def apply_driver_payout_snapshot(
    order: Order,
    group: DriverPaymentGroup | None,
) -> DriverPayout:
    payout = calculate_driver_payout(group, order.delivery_fees, order.delivery_tips)
    order.driver_payout = payout.total
    order.driver_fee_payout = payout.delivery_fee
    order.driver_tip_payout = payout.tip
    order.driver_payment_rule = payout.rule_type
    order.driver_payment_group_id = group.id if group else None
    order.driver_payment_group_name = group.name if group else None
    order.driver_payment_rule_snapshot = {
        "group_id": str(group.id) if group else None,
        "group_name": group.name if group else None,
        "rule_type": payout.rule_type,
        "fixed_amount": str(group.fixed_amount) if group and group.fixed_amount is not None else None,
        "delivery_fee_percentage": (
            str(group.delivery_fee_percentage)
            if group and group.delivery_fee_percentage is not None
            else None
        ),
        "platform_tip_percentage": (
            str(group.platform_tip_percentage)
            if group and group.platform_tip_percentage is not None
            else None
        ),
    }
    order.driver_payout_locked_at = datetime.now(timezone.utc)
    return payout


def clear_driver_payout_snapshot(order: Order) -> None:
    order.driver_payout = None
    order.driver_fee_payout = None
    order.driver_tip_payout = None
    order.driver_payment_rule = None
    order.driver_payment_group_id = None
    order.driver_payment_group_name = None
    order.driver_payment_rule_snapshot = None
    order.driver_payout_locked_at = None
