"""The quote lock: saving an order must reuse the route the admin was quoted.

Damage if these are wrong:
  load_route_facts            -> an id issued for one address pair prices a different pair
  _locked_quote_or_http_error -> the order saves at a fee the admin never saw
"""
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routers import orders as orders_router
from app.api.routers.orders import QuoteInput
from app.core.redis import get_redis
from app.schemas.order import DeliveryQuoteRequest, PlaceInput
from app.services.delivery_quote_service import PlaceDetails, RouteFacts
from app.services.quote_lock_service import load_route_facts, store_route_facts

pytestmark = pytest.mark.unit


def _place(place_id: str) -> PlaceDetails:
    return PlaceDetails(place_id, "1 Main St", 43.7, -79.4, "Toronto", "Ontario", "CA")


def _facts() -> RouteFacts:
    return RouteFacts(_place("A"), _place("B"), 4851, 449)


async def _redis():
    return await anext(get_redis())


class TestRouteFactsLock:
    async def test_a_stored_route_comes_back_unchanged(self):
        redis = await _redis()
        quote_id = await store_route_facts(redis, "A", "B", _facts())
        assert await load_route_facts(redis, quote_id, "A", "B") == _facts()

    async def test_an_id_for_other_addresses_is_refused(self):
        redis = await _redis()
        quote_id = await store_route_facts(redis, "A", "B", _facts())
        assert await load_route_facts(redis, quote_id, "A", "C") is None

    async def test_an_unknown_or_expired_id_is_refused(self):
        assert await load_route_facts(await _redis(), "nope", "A", "B") is None


class TestFeeDriftGuard:
    @pytest.fixture
    def fake_quote(self, monkeypatch):
        seen = {}

        async def _fake(db, *args, locked_facts=None):
            seen["locked_facts"] = locked_facts
            return SimpleNamespace(delivery_fee=Decimal("700.00"))

        monkeypatch.setattr(orders_router, "_get_quote_or_http_error", _fake)
        return seen

    async def test_the_locked_route_is_passed_to_the_quote(self, fake_quote):
        redis = await _redis()
        quote_id = await store_route_facts(redis, "A", "B", _facts())
        await orders_router._locked_quote_or_http_error(None, redis, QuoteInput("A", "B", None), quote_id, 700.0)
        assert fake_quote["locked_facts"] == _facts()

    async def test_a_different_fee_is_a_409_carrying_the_new_fee(self, fake_quote):
        with pytest.raises(HTTPException) as exc:
            await orders_router._locked_quote_or_http_error(None, await _redis(), QuoteInput("A", "B", None), None, 400.0)
        assert exc.value.status_code == 409
        assert exc.value.detail["delivery_fee"] == 700.0

    async def test_no_quoted_fee_means_no_guard(self, fake_quote):
        quote = await orders_router._locked_quote_or_http_error(None, await _redis(), QuoteInput("A", "B", None), None, None)
        assert quote.delivery_fee == Decimal("700.00")
        assert fake_quote["locked_facts"] is None


class TestQuoteEndpointReusesLock:
    @pytest.fixture
    def google_calls(self, monkeypatch):
        calls = []
        holder = self
        place = SimpleNamespace(id=None, name="X")
        zone = SimpleNamespace(id=uuid4(), name="Z")
        location = SimpleNamespace(city=SimpleNamespace(name="Toronto"), zone=zone)

        async def _fake(db, *args, locked_facts=None, provided_places=None):
            calls.append(locked_facts)
            holder.provided = provided_places
            return SimpleNamespace(
                pickup=location, delivery=location, distance_meters=4851, duration_seconds=449,
                radius_km=30, extra_distance_km=0, base_price=400, additional_per_km=5,
                distance_charge=0, applied_charges=(), delivery_fee=Decimal("400.00"),
                gst_rate=0, pst_rate=0, manual_fallback=False,
                route_facts=locked_facts or _facts(),
            )

        monkeypatch.setattr(orders_router, "_get_quote_or_http_error", _fake)
        return calls

    def _payload(self, quote_id=None):
        return DeliveryQuoteRequest(
            pickup_place_id="A", delivery_place_id="B", delivery_category_id=uuid4(), quote_id=quote_id
        )

    async def test_a_known_quote_id_is_reused_and_returned(self, google_calls):
        redis = await _redis()
        quote_id = await store_route_facts(redis, "A", "B", _facts())
        admin = SimpleNamespace(is_platform_admin=True)
        response = await orders_router.quote_delivery(self._payload(quote_id), admin, None, redis)
        assert google_calls == [_facts()]
        assert response.quote_id == quote_id
        assert 0 < response.quote_expires_in_seconds <= 15 * 60

    async def test_an_unknown_quote_id_gets_a_fresh_route_and_new_id(self, google_calls):
        redis = await _redis()
        admin = SimpleNamespace(is_platform_admin=True)
        response = await orders_router.quote_delivery(self._payload("nope"), admin, None, redis)
        assert google_calls == [None]
        assert response.quote_id and response.quote_id != "nope"

    async def test_the_browsers_places_are_passed_to_the_quote(self, google_calls):
        place = PlaceInput(
            place_id="A", formatted_address="1 Main St", latitude=43.7, longitude=-79.4,
            city="Toronto", province="Ontario", country_code="ca",
        )
        payload = self._payload()
        payload.pickup_place = place
        admin = SimpleNamespace(is_platform_admin=True)
        await orders_router.quote_delivery(payload, admin, None, await _redis())
        pickup, delivery = self.provided
        assert (pickup.place_id, pickup.country_code, delivery) == ("A", "CA", None)
