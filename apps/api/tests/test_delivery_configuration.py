from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.api.routers.delivery_configuration import (
    AfterHoursInput,
    BasePriceInput,
    CategoryInput,
    SpecialOccasionInput,
    SurchargeInput,
    ZoneInput,
    ZoneRadiusInput,
)


def test_after_hours_accepts_an_overnight_range() -> None:
    value = AfterHoursInput(
        start_time="21:00",
        end_time="02:30",
        extra_amount="5.25",
    )

    assert value.start_time.hour == 21
    assert value.end_time.hour == 2
    assert value.extra_amount == Decimal("5.25")


def test_after_hours_rejects_identical_start_and_end_times() -> None:
    with pytest.raises(ValidationError, match="Start and end time must be different"):
        AfterHoursInput(start_time="21:00", end_time="21:00", extra_amount=5)


@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        (SurchargeInput, {"name": "Overweight", "extra_amount": -1}),
        (
            ZoneInput,
            {"name": "Toronto", "city_ids": []},
        ),
    ],
)
def test_invalid_delivery_configuration_is_rejected(schema, payload) -> None:
    with pytest.raises(ValidationError):
        schema(**payload)


def test_customer_facing_text_is_trimmed() -> None:
    value = CategoryInput(name="  Rush  ", description="  Pickup within an hour.  ")
    assert value.name == "Rush"
    assert value.description == "Pickup within an hour."


def test_special_occasion_defaults_to_non_repeating() -> None:
    value = SpecialOccasionInput(name="One-off event", occasion_date="2026-08-10")
    assert value.repeats_annually is False


def test_base_price_supports_separate_radius_charges() -> None:
    value = BasePriceInput(
        individual_price="50.00",
        partner_price="40.00",
        individual_out_of_radius_per_km="3.00",
        partner_out_of_radius_per_km="2.00",
    )

    assert value.individual_out_of_radius_per_km == Decimal("3.00")
    assert value.partner_out_of_radius_per_km == Decimal("2.00")


def test_base_price_rejects_zero_radius() -> None:
    with pytest.raises(ValidationError):
        ZoneRadiusInput(radius_km=0)
