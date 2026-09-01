"""Tests for /api/v1/locations -- country/state/city lookups for address pickers.

Read-only, open to any authenticated user. Damage if these break:
  filtering -> a state list bleeds in another country's states (or cities another state's),
               so the address picker offers the wrong options
  auth      -> the lookup is exposed to anonymous callers
"""
import uuid

import pytest

from app.models.location import City, Country, State
from tests.utils import API

pytestmark = pytest.mark.integration

LOCATIONS = f"{API}/locations"


@pytest.fixture
async def geo(db):
    """Two countries, each with a state and cities, to prove list filtering holds."""
    canada = Country(name="Canada", code="CA")
    usa = Country(name="United States", code="US")
    db.add_all([canada, usa])
    await db.flush()

    ontario = State(name="Ontario", country_id=canada.id)
    california = State(name="California", country_id=usa.id)
    db.add_all([ontario, california])
    await db.flush()

    toronto = City(name="Toronto", state_id=ontario.id)
    ottawa = City(name="Ottawa", state_id=ontario.id)
    los_angeles = City(name="Los Angeles", state_id=california.id)
    db.add_all([toronto, ottawa, los_angeles])
    await db.flush()

    return {
        "canada": canada, "usa": usa,
        "ontario": ontario, "california": california,
        "toronto": toronto, "ottawa": ottawa, "los_angeles": los_angeles,
    }


class TestListCountries:
    async def test_lists_all_countries(self, tenant_admin_client, geo):
        response = await tenant_admin_client.get(f"{LOCATIONS}/countries")

        assert response.status_code == 200
        names = [c["name"] for c in response.json()]
        assert "Canada" in names
        assert "United States" in names

    async def test_requires_authentication(self, client):
        response = await client.get(f"{LOCATIONS}/countries")

        assert response.status_code == 401


class TestListStates:
    async def test_returns_states_for_a_country(self, tenant_admin_client, geo):
        response = await tenant_admin_client.get(
            f"{LOCATIONS}/countries/{geo['canada'].id}/states"
        )

        assert response.status_code == 200
        assert [s["name"] for s in response.json()] == ["Ontario"]

    async def test_excludes_another_countrys_states(self, tenant_admin_client, geo):
        response = await tenant_admin_client.get(
            f"{LOCATIONS}/countries/{geo['canada'].id}/states"
        )

        assert "California" not in [s["name"] for s in response.json()]

    async def test_unknown_country_returns_empty(self, tenant_admin_client):
        response = await tenant_admin_client.get(
            f"{LOCATIONS}/countries/{uuid.uuid4()}/states"
        )

        assert response.status_code == 200
        assert response.json() == []

    async def test_requires_authentication(self, client, geo):
        response = await client.get(f"{LOCATIONS}/countries/{geo['canada'].id}/states")

        assert response.status_code == 401


class TestListCities:
    async def test_returns_cities_for_a_state(self, tenant_admin_client, geo):
        response = await tenant_admin_client.get(
            f"{LOCATIONS}/states/{geo['ontario'].id}/cities"
        )

        assert response.status_code == 200
        # Ordered by name.
        assert [c["name"] for c in response.json()] == ["Ottawa", "Toronto"]

    async def test_excludes_another_states_cities(self, tenant_admin_client, geo):
        response = await tenant_admin_client.get(
            f"{LOCATIONS}/states/{geo['ontario'].id}/cities"
        )

        assert "Los Angeles" not in [c["name"] for c in response.json()]

    async def test_unknown_state_returns_empty(self, tenant_admin_client):
        response = await tenant_admin_client.get(f"{LOCATIONS}/states/{uuid.uuid4()}/cities")

        assert response.status_code == 200
        assert response.json() == []

    async def test_requires_authentication(self, client, geo):
        response = await client.get(f"{LOCATIONS}/states/{geo['ontario'].id}/cities")

        assert response.status_code == 401
