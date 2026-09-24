from decimal import Decimal
from uuid import uuid4

from app.models.discount import Discount, DiscountKind, DiscountTrigger
from app.services.discounts import (
    amount_for,
    as_dicts,
    build_lines,
    discount_amount,
    price_discounts,
    reprice_orphans,
    total_of,
)


def _discount(
    kind: str = "percentage",
    value: str = "10",
    *,
    title: str = "Late delivery",
    max_discount_amount: str | None = None,
    min_gross_fee: str | None = None,
    min_net_fee: str = "0",
    reason: str | None = "late_delivery",
) -> Discount:
    """A Discount as the engine sees it. Never flushed, so defaults are explicit."""
    return Discount(
        id=uuid4(),
        title=title,
        public_label=title,
        kind=DiscountKind(kind),
        value=Decimal(value),
        trigger=DiscountTrigger.manual,
        reason=reason,
        max_discount_amount=Decimal(max_discount_amount) if max_discount_amount else None,
        min_gross_fee=Decimal(min_gross_fee) if min_gross_fee else None,
        min_net_fee=Decimal(min_net_fee),
    )


class TestMechanics:
    def test_percentage_takes_a_share(self) -> None:
        assert discount_amount("percentage", Decimal("10"), Decimal("12.00")) == Decimal("1.20")

    def test_fixed_amount_takes_its_value(self) -> None:
        assert discount_amount("fixed_amount", Decimal("5"), Decimal("12.00")) == Decimal("5.00")

    def test_rounds_half_up_to_cents(self) -> None:
        assert discount_amount("percentage", Decimal("15"), Decimal("12.50")) == Decimal("1.88")

    def test_nothing_ever_exceeds_the_fee(self) -> None:
        assert discount_amount("fixed_amount", Decimal("500"), Decimal("12.00")) == Decimal("12.00")


class TestAmountFor:
    def test_max_discount_amount_caps_a_percentage(self) -> None:
        discount = _discount("percentage", "20", max_discount_amount="4")

        assert amount_for(discount, Decimal("30.00")) == Decimal("4.00")

    def test_min_gross_fee_holds_it_back(self) -> None:
        discount = _discount("fixed_amount", "5", min_gross_fee="8")

        assert amount_for(discount, Decimal("6.00")) == Decimal("0.00")
        assert amount_for(discount, Decimal("8.00")) == Decimal("5.00")

    def test_min_net_fee_leaves_a_floor(self) -> None:
        """The platform keeps at least $6 of a $20 fee, whatever the terms say."""
        discount = _discount("percentage", "100", min_net_fee="6")

        assert amount_for(discount, Decimal("20.00")) == Decimal("14.00")

    def test_nothing_is_taken_off_a_fee_of_nothing(self) -> None:
        assert amount_for(_discount(), Decimal("0.00")) == Decimal("0.00")


class TestPriceDiscounts:
    def test_prices_each_against_what_is_left(self) -> None:
        first = _discount("fixed_amount", "5", title="Goodwill")
        second = _discount("percentage", "10", title="Late delivery")

        lines = price_discounts([first, second], Decimal("20.00"))

        assert [line.amount for line in lines] == [Decimal("5.00"), Decimal("1.50")]

    def test_the_sum_never_exceeds_the_fee(self) -> None:
        lines = price_discounts(
            [_discount("fixed_amount", "15"), _discount("fixed_amount", "15")],
            Decimal("20.00"),
        )

        assert sum(line.amount for line in lines) == Decimal("20.00")

    def test_a_discount_worth_nothing_is_left_out(self) -> None:
        lines = price_discounts(
            [_discount("fixed_amount", "20"), _discount("percentage", "50")],
            Decimal("20.00"),
        )

        assert len(lines) == 1

    def test_the_line_carries_what_a_receipt_needs(self) -> None:
        admin_id = uuid4()
        discount = _discount("percentage", "10", title="Late delivery")

        [line] = price_discounts(
            [discount], Decimal("20.00"), note="Called ahead", applied_by=admin_id
        )
        as_json = line.as_dict()

        assert as_json["discount_id"] == str(discount.id)
        assert as_json["label"] == "Late delivery"
        assert as_json["amount"] == 2.0
        assert as_json["source"] == "manual"
        assert as_json["reason"] == "late_delivery"
        assert as_json["note"] == "Called ahead"
        assert as_json["applied_by"] == str(admin_id)


class TestOrphanLines:
    """Lines from before discounts were rows still have to work."""

    def test_a_percentage_follows_the_fee(self) -> None:
        stored = [{"kind": "percentage", "value": 10.0, "amount": 2.0, "label": "Discount (10%)"}]

        assert reprice_orphans(stored, Decimal("40.00"))[0]["amount"] == 4.0

    def test_a_fixed_amount_is_capped_down(self) -> None:
        stored = [{"kind": "fixed_amount", "value": 9.0, "amount": 9.0, "label": "Discount"}]

        [line] = reprice_orphans(stored, Decimal("4.00"))

        assert line["amount"] == 4.0
        # Terms survive, so a later fee rise restores the full amount.
        assert reprice_orphans([line], Decimal("12.00"))[0]["amount"] == 9.0

    def test_they_are_priced_before_selected_discounts(self) -> None:
        orphan = [{"kind": "fixed_amount", "value": 8.0, "amount": 8.0, "label": "Discount"}]

        lines = build_lines(
            gross_fee=Decimal("10.00"),
            discounts=[_discount("fixed_amount", "5")],
            orphan_lines=orphan,
        )

        assert [line["amount"] for line in lines] == [8.0, 2.0]
        assert total_of(lines) == Decimal("10.00")


class TestTotalOf:
    def test_sums_the_lines(self) -> None:
        assert total_of([{"amount": 1.2}, {"amount": 3.45}]) == Decimal("4.65")

    def test_no_lines_total_nothing(self) -> None:
        assert total_of([]) == Decimal("0.00")

    def test_an_unreadable_amount_is_skipped(self) -> None:
        assert total_of([{"amount": "oops"}, {"amount": 2}]) == Decimal("2.00")

    def test_matches_the_dicts_the_order_stores(self) -> None:
        lines = as_dicts(price_discounts([_discount("percentage", "10")], Decimal("20.00")))

        assert total_of(lines) == Decimal("2.00")
