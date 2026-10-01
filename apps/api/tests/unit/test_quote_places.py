"""Place details from the browser: used when complete, looked up when not.

Damage if these are wrong:
  _resolve_places -> a quote prices the wrong place, or pays for Places lookups it did not need
"""
import pytest

from app.services import delivery_quote_service as service
from app.services.delivery_quote_service import PlaceDetails, _resolve_places

pytestmark = pytest.mark.unit


def _place(place_id: str, **overrides) -> PlaceDetails:
    fields = dict(
        place_id=place_id, formatted_address="1 Main St", latitude=43.7, longitude=-79.4,
        city="Toronto", province="Ontario", country_code="CA",
    )
    return PlaceDetails(**{**fields, **overrides})


@pytest.fixture
def lookups(monkeypatch):
    """Records which place ids fell through to a Google Places lookup."""
    fetched: list[str] = []

    async def _fake(client, place_id):
        fetched.append(place_id)
        return _place(place_id, formatted_address="from google")

    monkeypatch.setattr(service, "_fetch_place", _fake)
    return fetched


class TestResolvePlaces:
    async def test_complete_details_skip_the_lookup(self, lookups):
        pickup, delivery = await _resolve_places(None, "A", "B", (_place("A"), _place("B")))
        assert (pickup.place_id, delivery.place_id) == ("A", "B")
        assert lookups == []

    async def test_no_details_looks_up_both(self, lookups):
        await _resolve_places(None, "A", "B", None)
        assert sorted(lookups) == ["A", "B"]

    async def test_only_the_missing_one_is_looked_up(self, lookups):
        pickup, delivery = await _resolve_places(None, "A", "B", (_place("A"), None))
        assert lookups == ["B"]
        assert pickup.formatted_address == "1 Main St"
        assert delivery.formatted_address == "from google"

    async def test_details_for_another_place_are_ignored(self, lookups):
        await _resolve_places(None, "A", "B", (_place("OTHER"), _place("B")))
        assert lookups == ["A"]

    @pytest.mark.parametrize("field", ["city", "province", "country_code", "formatted_address"])
    async def test_incomplete_details_are_looked_up(self, lookups, field):
        await _resolve_places(None, "A", "B", (_place("A", **{field: "  "}), _place("B")))
        assert lookups == ["A"]
