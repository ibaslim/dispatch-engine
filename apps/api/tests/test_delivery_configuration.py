from datetime import date, time
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.api.routers.delivery_configuration import (
    AfterHoursInput,
    BasePriceInput,
    CategoryInput,
    DeliveryPolicyInput,
    SpecialOccasionInput,
    SurchargeInput,
    ZoneInput,
    ZoneRadiusInput,
)
from app.models.delivery_configuration import SpecialOccasion
from app.models.delivery_configuration import OperationalZone, OperationalZoneCity
from app.models.location import City, State
from app.services.delivery_quote_service import (
    _occasion_matches,
    _within_time_range,
    calculate_delivery_fee,
    calculate_percentage_charge,
    match_manual_operational_region,
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
    value = SpecialOccasionInput(
        name="One-off event", occasion_date="2026-08-10", extra_percentage="15.00"
    )
    assert value.repeats_annually is False
    assert value.extra_percentage == Decimal("15.00")


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


def test_delivery_fee_stays_fixed_within_zone_radius() -> None:
    extra_km, fee = calculate_delivery_fee(
        distance_meters=29_999,
        radius_km=Decimal("30.00"),
        base_price=Decimal("25.00"),
        additional_per_km=Decimal("2.00"),
    )

    assert extra_km == Decimal("0.00")
    assert fee == Decimal("25.00")


def test_delivery_fee_adds_only_distance_beyond_radius() -> None:
    extra_km, fee = calculate_delivery_fee(
        distance_meters=32_500,
        radius_km=Decimal("30.00"),
        base_price=Decimal("25.00"),
        additional_per_km=Decimal("2.00"),
    )

    assert extra_km == Decimal("2.50")
    assert fee == Decimal("30.00")


def test_after_hours_charge_window_supports_overnight_ranges() -> None:
    assert _within_time_range(time(23, 30), time(21), time(2, 30)) is True
    assert _within_time_range(time(1, 15), time(21), time(2, 30)) is True
    assert _within_time_range(time(12), time(21), time(2, 30)) is False


def test_special_occasion_percentage_is_calculated_from_delivery_charges() -> None:
    assert calculate_percentage_charge(Decimal("80.00"), Decimal("15.00")) == Decimal("12.00")


def test_repeating_special_occasion_matches_month_and_day() -> None:
    occasion = SpecialOccasion(
        name="Canada Day",
        occasion_date=date(2025, 7, 1),
        repeats_annually=True,
        extra_percentage=Decimal("10.00"),
    )

    assert _occasion_matches(occasion, date(2026, 7, 1)) is True
    assert _occasion_matches(occasion, date(2026, 7, 2)) is False


def test_delivery_policy_validates_default_tax_percentage() -> None:
    value = DeliveryPolicyInput(
        allow_intercity=True,
        default_tax_percentage="13.00",
    )

    assert value.allow_intercity is True
    assert value.default_tax_percentage == Decimal("13.00")

    with pytest.raises(ValidationError):
        DeliveryPolicyInput(allow_intercity=False, default_tax_percentage=101)


def test_manual_address_matches_zone_or_city_case_insensitively() -> None:
    state = State(name="Alberta")
    city = City(name="Edmonton", state=state)
    zone = OperationalZone(name="Capital Region")
    zone.cities = [OperationalZoneCity(city=city)]

    city_match = match_manual_operational_region(
        "101 Main Street, EDMONTON, AB",
        [zone],
    )
    zone_match = match_manual_operational_region(
        "Warehouse 4, capital region",
        [zone],
    )

    assert city_match == (zone, city)
    assert zone_match == (zone, city)


def test_manual_address_outside_configured_regions_is_rejected() -> None:
    state = State(name="Alberta")
    city = City(name="Edmonton", state=state)
    zone = OperationalZone(name="Capital Region")
    zone.cities = [OperationalZoneCity(city=city)]

    assert match_manual_operational_region("101 Main Street, Calgary", [zone]) is None
