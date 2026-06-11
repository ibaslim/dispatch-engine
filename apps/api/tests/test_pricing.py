import pytest
from pydantic import ValidationError

from app.api.routers.pricing import PartnerRates, Rates, _apply_partner_rates, _apply_rates
from app.db.canada_official_cities import CANADIAN_PROVINCES_AND_CITIES
from app.db.seed_locations import GEO_DATA
from app.models.location import CityPricing, PartnerCityPricing


def test_rates_reject_negative_values() -> None:
    with pytest.raises(ValidationError):
        Rates(
            partner_price_per_km=-1,
            partner_price_per_kg=2,
            individual_price_per_km=2,
            individual_price_per_kg=2,
        )


def test_apply_rates_updates_all_customer_rates() -> None:
    pricing = CityPricing()
    rates = Rates(
        partner_price_per_km=2.5,
        partner_price_per_kg=3,
        individual_price_per_km=4.5,
        individual_price_per_kg=5,
    )

    _apply_rates(pricing, rates)

    assert pricing.partner_price_per_km == 2.5
    assert pricing.partner_price_per_kg == 3
    assert pricing.individual_price_per_km == 4.5
    assert pricing.individual_price_per_kg == 5


def test_apply_partner_rates_updates_partner_override() -> None:
    pricing = PartnerCityPricing()
    _apply_partner_rates(pricing, PartnerRates(price_per_km=7.5, price_per_kg=8))
    assert pricing.price_per_km == 7.5
    assert pricing.price_per_kg == 8


def test_canada_seed_contains_all_provinces_and_territories() -> None:
    _, states = GEO_DATA["Canada"]
    assert len(states) == 13
    assert sum(map(len, CANADIAN_PROVINCES_AND_CITIES.values())) == 395
    assert "Lac-des-Aigles" in CANADIAN_PROVINCES_AND_CITIES["Quebec"]
