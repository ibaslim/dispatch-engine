from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.order import ManualDiscountInput, ManualDiscountKind, ManualDiscountReason
from app.services.discounts import apply_manual, as_dicts, reprice, total_of


def _manual(kind="percentage", value=10, reason="sales_goodwill", note=None) -> ManualDiscountInput:
    return ManualDiscountInput(kind=kind, value=value, reason=reason, note=note)


class TestApplyManual:
    def test_no_manual_discount_applies_nothing(self) -> None:
        assert apply_manual(None, Decimal("12.00")) == []

    def test_percentage_comes_off_the_delivery_fee(self) -> None:
        [line] = apply_manual(_manual(value=10), Decimal("12.00"))

        assert line.amount == Decimal("1.20")
        assert line.kind == "percentage"
        assert line.label == "Discount (10%)"
        assert line.value == Decimal("10")

    def test_fixed_amount_comes_off_as_entered(self) -> None:
        [line] = apply_manual(_manual(kind="fixed_amount", value=5), Decimal("12.00"))

        assert line.amount == Decimal("5.00")
        assert line.label == "Discount"

    def test_fixed_amount_is_capped_at_the_fee(self) -> None:
        """A discount never eats into the goods value, tax or tip owed to others."""
        [line] = apply_manual(_manual(kind="fixed_amount", value=40), Decimal("12.00"))

        assert line.amount == Decimal("12.00")

    def test_full_percentage_is_capped_at_the_fee(self) -> None:
        [line] = apply_manual(_manual(value=100), Decimal("12.00"))

        assert line.amount == Decimal("12.00")

    def test_rounds_half_up_to_cents(self) -> None:
        [line] = apply_manual(_manual(value=15), Decimal("12.50"))

        assert line.amount == Decimal("1.88")

    def test_nothing_is_applied_when_there_is_no_fee(self) -> None:
        assert apply_manual(_manual(value=10), Decimal("0.00")) == []

    def test_records_who_applied_it_and_why(self) -> None:
        admin_id = uuid4()
        [line] = apply_manual(
            _manual(reason="late_delivery"), Decimal("12.00"), applied_by=admin_id
        )

        assert line.reason == "late_delivery"
        assert line.as_dict()["applied_by"] == str(admin_id)
        assert line.as_dict()["source"] == "manual"


class TestReprice:
    def test_percentage_follows_a_new_fee(self) -> None:
        stored = as_dicts(apply_manual(_manual(value=10), Decimal("12.00")))

        [line] = reprice(stored, Decimal("20.00"))

        assert line["amount"] == 2.0
        assert line["value"] == 10.0

    def test_fixed_amount_is_capped_down_to_a_smaller_fee(self) -> None:
        stored = as_dicts(apply_manual(_manual(kind="fixed_amount", value=9), Decimal("12.00")))

        [line] = reprice(stored, Decimal("4.00"))

        assert line["amount"] == 4.0
        # The agreed terms survive, so a later fee rise restores the full amount.
        assert line["value"] == 9.0
        assert reprice([line], Decimal("12.00"))[0]["amount"] == 9.0

    def test_a_line_worth_nothing_is_dropped(self) -> None:
        stored = as_dicts(apply_manual(_manual(value=10), Decimal("12.00")))

        assert reprice(stored, Decimal("0.00")) == []

    def test_no_lines_reprice_to_no_lines(self) -> None:
        assert reprice(None, Decimal("12.00")) == []


class TestTotalOf:
    def test_sums_the_lines(self) -> None:
        lines = [{"amount": 1.2}, {"amount": 3.45}]

        assert total_of(lines) == Decimal("4.65")

    def test_no_lines_total_zero(self) -> None:
        assert total_of([]) == Decimal("0.00")

    def test_unreadable_amount_is_skipped(self) -> None:
        assert total_of([{"amount": "oops"}, {"amount": 2}]) == Decimal("2.00")


class TestManualDiscountInput:
    def test_rejects_a_percentage_over_one_hundred(self) -> None:
        with pytest.raises(ValidationError):
            _manual(value=101)

    def test_rejects_a_value_of_zero(self) -> None:
        with pytest.raises(ValidationError):
            _manual(value=0)

    def test_other_reason_requires_a_note(self) -> None:
        with pytest.raises(ValidationError):
            _manual(reason="other")

    def test_other_reason_accepts_a_note(self) -> None:
        discount = _manual(reason="other", note="  Agreed with the vendor  ")

        assert discount.note == "Agreed with the vendor"
        assert discount.reason == ManualDiscountReason.other

    def test_blank_note_is_stored_as_nothing(self) -> None:
        assert _manual(note="   ").note is None

    def test_kind_is_limited_to_the_two_mechanics(self) -> None:
        assert _manual().kind == ManualDiscountKind.percentage
        with pytest.raises(ValidationError):
            _manual(kind="free_delivery")
