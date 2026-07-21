import asyncio
import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.api.routers.driver_payroll import PaymentGroupInput, _save_payment_group
from app.api.routers.orders import _driver_order_response
from app.models.driver_payment import DriverPaymentGroup
from app.models.order import ActivityStatus, Order, OrderStatus
from app.services.driver_payout_service import (
    apply_driver_payout_snapshot,
    calculate_driver_payout,
)


class _EmptyScalars:
    def all(self):
        return []


class _CreateGroupSession:
    def __init__(self):
        self.group = None
        self.scalar_calls = 0
        self.flushed_values = None

    async def scalar(self, _statement):
        self.scalar_calls += 1
        return None if self.scalar_calls == 1 else self.group

    async def scalars(self, _statement):
        return _EmptyScalars()

    def add(self, group):
        self.group = group

    async def flush(self):
        self.flushed_values = (self.group.name, self.group.rule_type)
        self.group.id = uuid.uuid4()

    async def commit(self):
        return None


def _priced_order() -> Order:
    return Order(
        id=uuid.uuid4(),
        order_number="ORDER-1",
        pickup_name="Pickup",
        pickup_phone="111",
        pickup_email="pickup@example.com",
        pickup_address="Pickup address",
        pickup_date="2026-07-19",
        pickup_time="10:00",
        delivery_name="Delivery",
        delivery_phone="222",
        delivery_email="delivery@example.com",
        delivery_address="Delivery address",
        delivery_date="2026-07-19",
        delivery_time="11:00",
        items=[{"itemName": "Parcel", "itemPrice": 100, "itemQty": 1}],
        surcharge_ids=[],
        applied_charges=[],
        subtotal=100,
        tax_rate=5,
        tax_amount=5,
        delivery_fees=20,
        delivery_tips=5,
        discount=0,
        total=130,
        payment_method="credit_card",
        payment_details={"creditCard": {"cardNumber": "4111111111111111"}},
        status=OrderStatus.current,
        activity_status=ActivityStatus.driver_not_assigned,
        ready_for_pickup=False,
        published=False,
    )


def test_fixed_payment_rule_requires_an_amount():
    with pytest.raises(ValidationError):
        PaymentGroupInput(name="Fixed", rule_type="fixed")


def test_percentage_payment_rule_accepts_zero_to_one_hundred():
    payment_group = PaymentGroupInput(
        name="Percentage",
        rule_type="percentage",
        delivery_fee_percentage=Decimal("35"),
    )

    assert payment_group.delivery_fee_percentage == Decimal("35")


def test_pass_through_rule_requires_fee_and_platform_tip_percentages():
    with pytest.raises(ValidationError):
        PaymentGroupInput(
            name="Pass through",
            rule_type="passthrough",
            delivery_fee_percentage=Decimal("75"),
        )


def test_payment_rule_rejects_percentages_over_one_hundred():
    with pytest.raises(ValidationError):
        PaymentGroupInput(
            name="Invalid",
            rule_type="percentage",
            delivery_fee_percentage=Decimal("101"),
        )


def test_new_group_has_required_values_before_first_flush():
    db = _CreateGroupSession()
    data = PaymentGroupInput(
        name="Fixed drivers",
        rule_type="fixed",
        fixed_amount=Decimal("12.50"),
    )

    group = asyncio.run(_save_payment_group(db, data))

    assert db.flushed_values == ("Fixed drivers", "fixed")
    assert group.fixed_amount == Decimal("12.50")


def test_fixed_rule_returns_the_configured_delivery_amount():
    group = DriverPaymentGroup(
        name="Fixed",
        rule_type="fixed",
        fixed_amount=Decimal("10.00"),
    )

    payout = calculate_driver_payout(group, delivery_fee=50, customer_tip=8)

    assert payout.total == Decimal("10.00")
    assert payout.tip == Decimal("0.00")


def test_percentage_rule_uses_delivery_fee_not_order_total():
    group = DriverPaymentGroup(
        name="Percentage",
        rule_type="percentage",
        delivery_fee_percentage=Decimal("25.00"),
    )

    payout = calculate_driver_payout(group, delivery_fee=20, customer_tip=8)

    assert payout.total == Decimal("5.00")


def test_pass_through_rule_combines_fee_and_driver_tip_shares():
    group = DriverPaymentGroup(
        name="Pass through",
        rule_type="passthrough",
        delivery_fee_percentage=Decimal("50.00"),
        platform_tip_percentage=Decimal("20.00"),
    )

    payout = calculate_driver_payout(group, delivery_fee=20, customer_tip=5)

    assert payout.delivery_fee == Decimal("10.00")
    assert payout.tip == Decimal("4.00")
    assert payout.total == Decimal("14.00")


def test_driver_without_payment_group_has_zero_payout():
    payout = calculate_driver_payout(None, delivery_fee=20, customer_tip=5)

    assert payout.total == Decimal("0.00")
    assert payout.rule_type is None


def test_driver_order_response_exposes_payout_and_masks_platform_prices():
    group = DriverPaymentGroup(
        name="Fixed",
        rule_type="fixed",
        fixed_amount=Decimal("10.00"),
    )
    order = _priced_order()

    response = _driver_order_response(order, group)

    assert response["driver_payout"] == 10
    assert response["total"] == 0
    assert response["delivery_fees"] == 0
    assert response["delivery_tips"] == 0
    assert response["items"][0]["itemPrice"] == 0
    assert response["payment_details"] is None


def test_assigned_order_keeps_snapshot_after_group_rule_changes():
    driver_id = uuid.uuid4()
    group = DriverPaymentGroup(
        id=uuid.uuid4(),
        name="Original fixed rule",
        rule_type="fixed",
        fixed_amount=Decimal("10.00"),
    )
    order = _priced_order()
    order.driver_id = driver_id
    apply_driver_payout_snapshot(order, group)

    group.rule_type = "passthrough"
    group.fixed_amount = None
    group.delivery_fee_percentage = Decimal("100.00")
    group.platform_tip_percentage = Decimal("0.00")
    response = _driver_order_response(order, group)

    assert response["driver_payout"] == 10
    assert response["driver_payment_rule"] == "fixed"
    assert response["driver_payment_group_name"] == "Original fixed rule"
