"""Pins what the delivery quote charges, for the Google and the manual-address builders.

Damage if these break:
  fee formula       -> every order is priced wrong
  charges           -> after-hours, surcharge or occasion amounts go missing or double
  partner pricing   -> a vendor is billed the individual rate, or the reverse
  error messages    -> the form shows the admin a different reason than it does today

Google is replaced at its two edges (_fetch_place, _fetch_route); everything else is real.
"""
from datetime import date, datetime, time
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.delivery_configuration import (
    AfterHoursDelivery,
    DeliveryCategory,
    DeliveryPolicy,
    OperationalZone,
    OperationalZoneCity,
    PartnerZoneCategoryPrice,
    SpecialOccasion,
    Surcharge,
    ZoneCategoryPrice,
)
from app.models.location import City, Country, State, StateTax
from app.services import delivery_quote_service as service
from app.services.delivery_quote_service import (
    DeliveryQuoteError,
    PlaceDetails,
    RouteFacts,
    build_delivery_quote,
    build_manual_delivery_quote,
)
from tests.factories import TenantFactory

pytestmark = pytest.mark.integration

PLACES = {
    "P1": ("Toronto", "Ontario", "CA"),
    "P2": ("Toronto", "Ontario", "CA"),
    "OTT": ("Ottawa", "Ontario", "CA"),
    "CAL": ("Calgary", "Alberta", "CA"),
    "NYC": ("New York", "New York", "US"),
}


def _place(place_id: str) -> PlaceDetails:
    city, province, country = PLACES[place_id]
    return PlaceDetails(place_id, f"1 Main St, {city}", 43.7, -79.4, city, province, country)


@pytest.fixture
async def world(db):
    """Zone GTA (30 km, 5% GST) with Toronto and Ottawa, Ontario PST 8%, one category."""
    country = Country(name="Canada", code="CA")
    db.add(country)
    await db.flush()
    state = State(name="Ontario", country_id=country.id)
    db.add(state)
    await db.flush()
    toronto, ottawa = City(name="Toronto", state_id=state.id), City(name="Ottawa", state_id=state.id)
    zone = OperationalZone(name="GTA", radius_km=Decimal("30.00"), gst_percentage=Decimal("5.000"))
    category = DeliveryCategory(name="Parcel", description="Small parcels")
    policy = DeliveryPolicy(key="default", allow_intercity=False)
    db.add_all([toronto, ottawa, zone, category, StateTax(state_id=state.id, pst_percentage=Decimal("8.000"))])
    await db.flush()
    db.add_all([
        OperationalZoneCity(zone_id=zone.id, city_id=toronto.id),
        OperationalZoneCity(zone_id=zone.id, city_id=ottawa.id),
        policy,
        ZoneCategoryPrice(
            zone_id=zone.id, category_id=category.id,
            individual_price=Decimal("400"), partner_price=Decimal("300"),
            individual_out_of_radius_per_km=Decimal("5"), partner_out_of_radius_per_km=Decimal("3"),
        ),
    ])
    await db.flush()
    return SimpleNamespace(db=db, zone=zone, category=category, policy=policy)


@pytest.fixture
def google(monkeypatch):
    """Replaces Google; `route` holds the distance and duration the next quote will see."""
    state = SimpleNamespace(route=(12_000, 600), fetched=[])

    async def _place_lookup(client, place_id):
        state.fetched.append(place_id)
        return _place(place_id)

    async def _route_lookup(client, pickup_id, delivery_id):
        return state.route

    monkeypatch.setattr(service, "_fetch_place", _place_lookup)
    monkeypatch.setattr(service, "_fetch_route", _route_lookup)
    return state


async def quote(world, pickup="P1", delivery="P2", **kwargs):
    return await build_delivery_quote(world.db, pickup, delivery, world.category.id, **kwargs)


async def manual(world, pickup="12 King St, Toronto", delivery="9 Bay St, Toronto", **kwargs):
    return await build_manual_delivery_quote(world.db, pickup, delivery, world.category.id, **kwargs)


async def message(coro) -> str:
    with pytest.raises(DeliveryQuoteError) as exc:
        await coro
    return exc.value.message


class TestDistanceFee:
    async def test_inside_the_radius_costs_the_base_price(self, world, google):
        result = await quote(world)
        assert (result.delivery_fee, result.extra_distance_km, result.distance_charge) == (
            Decimal("400.00"), Decimal("0.00"), Decimal("0.00"),
        )
        assert (result.distance_meters, result.duration_seconds, result.manual_fallback) == (12_000, 600, False)

    async def test_distance_beyond_the_radius_is_charged_per_km(self, world, google):
        google.route = (35_500, 900)
        result = await quote(world)
        assert (result.extra_distance_km, result.distance_charge, result.delivery_fee) == (
            Decimal("5.50"), Decimal("27.50"), Decimal("427.50"),
        )

    async def test_the_pickup_zone_sets_the_tax_rates(self, world, google):
        result = await quote(world)
        assert (result.gst_rate, result.pst_rate) == (Decimal("5.000"), Decimal("8.000"))
        assert result.pickup.zone.id == world.zone.id


class TestPartnerPricing:
    async def test_a_vendor_without_an_override_pays_the_partner_rate(self, world, google):
        google.route = (33_000, 900)
        vendor = await TenantFactory.create(world.db)
        result = await quote(world, vendor_id=vendor.id)
        assert (result.base_price, result.additional_per_km, result.delivery_fee) == (
            Decimal("300"), Decimal("3"), Decimal("309.00"),
        )

    async def test_a_vendor_override_wins_over_the_partner_rate(self, world, google):
        google.route = (33_000, 900)
        vendor = await TenantFactory.create(world.db)
        price = await world.db.scalar(
            ZoneCategoryPrice.__table__.select().where(ZoneCategoryPrice.zone_id == world.zone.id).with_only_columns(ZoneCategoryPrice.id)
        )
        world.db.add(PartnerZoneCategoryPrice(
            zone_category_price_id=price, partner_id=vendor.id,
            price=Decimal("250"), out_of_radius_per_km=Decimal("2"),
        ))
        await world.db.flush()
        result = await quote(world, vendor_id=vendor.id)
        assert (result.base_price, result.delivery_fee) == (Decimal("250"), Decimal("256.00"))


class TestCharges:
    @pytest.fixture
    async def charged(self, world):
        world.db.add_all([
            AfterHoursDelivery(start_time=time(22, 0), end_time=time(6, 0), extra_amount=Decimal("100")),
            Surcharge(name="Fragile", extra_amount=Decimal("50")),
            Surcharge(name="Bulky", extra_amount=Decimal("30")),
            SpecialOccasion(name="Christmas", occasion_date=date(2020, 12, 25),
                            repeats_annually=True, extra_percentage=Decimal("10")),
        ])
        await world.db.flush()
        return world

    async def test_after_hours_applies_only_to_a_specified_time_in_range(self, charged, google):
        late = datetime(2026, 6, 1, 23, 30)
        assert (await quote(charged, delivery_planned_at=late, delivery_time_specified=True)).delivery_fee == Decimal("500.00")
        assert (await quote(charged, delivery_planned_at=late, delivery_time_specified=False)).delivery_fee == Decimal("400.00")
        noon = datetime(2026, 6, 1, 12, 0)
        assert (await quote(charged, delivery_planned_at=noon, delivery_time_specified=True)).delivery_fee == Decimal("400.00")

    async def test_selected_surcharges_are_listed_by_name(self, charged, google):
        rows = (await charged.db.execute(Surcharge.__table__.select())).all()
        result = await quote(charged, surcharge_ids=[row.id for row in rows])
        assert [(c.kind, c.label, c.amount) for c in result.applied_charges] == [
            ("surcharge", "Bulky", Decimal("30")), ("surcharge", "Fragile", Decimal("50")),
        ]
        assert result.delivery_fee == Decimal("480.00")

    async def test_an_annual_occasion_adds_a_percentage_of_the_fee_and_charges(self, charged, google):
        rows = (await charged.db.execute(Surcharge.__table__.select().where(Surcharge.name == "Fragile"))).all()
        result = await quote(charged, surcharge_ids=[rows[0].id], delivery_planned_at=datetime(2026, 12, 25, 9, 0))
        occasion = result.applied_charges[-1]
        assert (occasion.kind, occasion.label, occasion.amount) == ("special_occasion", "Christmas (10.00%)", Decimal("45.00"))
        assert result.delivery_fee == Decimal("495.00")

    async def test_an_unknown_or_malformed_surcharge_is_refused(self, charged, google):
        import uuid
        assert await message(quote(charged, surcharge_ids=[uuid.uuid4()])) == "One or more selected surcharges no longer exist."
        assert await message(quote(charged, surcharge_ids=["not-a-uuid"])) == "One or more selected surcharges are invalid."


class TestGoogleRefusals:
    async def test_intercity_is_refused_unless_the_policy_allows_it(self, world, google):
        assert await message(quote(world, delivery="OTT")) == (
            "Inter-city delivery is disabled. Pickup and delivery must be in the same city."
        )
        world.policy.allow_intercity = True
        assert (await quote(world, delivery="OTT")).delivery.city.name == "Ottawa"

    async def test_a_category_without_a_price_is_refused(self, world, google):
        other = DeliveryCategory(name="Pallet", description="Pallets")
        world.db.add(other)
        await world.db.flush()
        assert await message(build_delivery_quote(world.db, "P1", "P2", other.id)) == (
            "Pricing is not configured for this pickup zone and delivery category."
        )

    async def test_a_city_outside_every_zone_is_refused(self, world, google):
        assert await message(quote(world, pickup="CAL")) == "Calgary, Alberta is outside the operational zones."

    async def test_a_place_outside_canada_is_refused(self, world, google):
        assert "outside the supported country" in await message(quote(world, pickup="NYC"))


class TestLockedRoute:
    async def test_locked_facts_price_the_route_without_calling_google(self, world, google):
        facts = RouteFacts(_place("P1"), _place("P2"), 35_500, 900)
        result = await quote(world, locked_facts=facts)
        assert google.fetched == []
        assert (result.distance_meters, result.delivery_fee) == (35_500, Decimal("427.50"))
        assert result.route_facts == facts

    async def test_a_fresh_quote_carries_the_route_it_used(self, world, google):
        result = await quote(world)
        assert result.route_facts == RouteFacts(_place("P1"), _place("P2"), 12_000, 600)


class TestManualAddresses:
    async def test_manual_quote_charges_the_base_price_with_no_distance(self, world):
        result = await manual(world)
        assert (result.manual_fallback, result.distance_meters, result.extra_distance_km) == (True, 0, Decimal("0.00"))
        assert (result.base_price, result.additional_per_km, result.delivery_fee) == (
            Decimal("400"), Decimal("0.00"), Decimal("400.00"),
        )
        assert (result.gst_rate, result.pst_rate) == (Decimal("5.000"), Decimal("8.000"))
        assert result.pickup.place.place_id == f"manual:{world.zone.id}"

    async def test_manual_quote_still_applies_the_configured_charges(self, world):
        world.db.add_all([
            AfterHoursDelivery(start_time=time(22, 0), end_time=time(6, 0), extra_amount=Decimal("100")),
            Surcharge(name="Fragile", extra_amount=Decimal("50")),
            SpecialOccasion(name="Christmas", occasion_date=date(2020, 12, 25),
                            repeats_annually=True, extra_percentage=Decimal("10")),
        ])
        await world.db.flush()
        rows = (await world.db.execute(Surcharge.__table__.select())).all()
        result = await manual(
            world, surcharge_ids=[rows[0].id],
            delivery_planned_at=datetime(2026, 12, 25, 23, 30), delivery_time_specified=True,
        )
        assert [(c.kind, c.amount) for c in result.applied_charges] == [
            ("after_hours", Decimal("100")), ("surcharge", Decimal("50")), ("special_occasion", Decimal("55.00")),
        ]
        assert result.delivery_fee == Decimal("605.00")

    async def test_manual_partner_price_uses_the_partner_rate(self, world):
        vendor = await TenantFactory.create(world.db)
        assert (await manual(world, vendor_id=vendor.id)).delivery_fee == Decimal("300.00")

    async def test_manual_refusals_keep_their_own_wording(self, world):
        assert await message(manual(world, pickup="  ")) == "Enter a manual street address."
        assert await message(manual(world, pickup="1 Nowhere Rd")) == (
            "Manual address is outside the operational regions. Include a configured zone or city name."
        )
        assert await message(manual(world, delivery="3 Rideau St, Ottawa")) == (
            "Inter-city delivery is disabled. Pickup and delivery must include the same configured city."
        )
