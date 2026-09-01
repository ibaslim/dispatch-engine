"""Tests for /api/v1/pricing.

Auth split: GET routes are open to any authenticated user (CurrentUser); every write is
platform-admin only (PlatformAdmin). Damage if these break:
  RBAC     -> a tenant user rewrites global / per-region / per-partner delivery rates
  defaults -> the base per-km/per-kg rates the whole quote engine reads are unguarded
  partner  -> a rate override attaches to a non-partner (non-vendor) tenant
"""
import uuid

import pytest

from app.models.location import City, Country, State
from app.models.tenant import TenantRole
from tests.factories import TenantFactory
from tests.utils import API

pytestmark = pytest.mark.integration

PRICING = f"{API}/pricing"
_ID = str(uuid.uuid4())

RATES = {
    "partner_price_per_km": 1.5,
    "partner_price_per_kg": 0.5,
    "individual_price_per_km": 2.0,
    "individual_price_per_kg": 0.75,
}
PARTNER_RATES = {"price_per_km": 1.2, "price_per_kg": 0.4}

WRITE_ROUTES = [
    ("put", "/defaults"),
    ("put", f"/states/{_ID}"),
    ("put", f"/cities/{_ID}"),
    ("put", f"/partners/{_ID}/defaults"),
    ("put", f"/partners/{_ID}/states/{_ID}"),
    ("put", f"/partners/{_ID}/cities/{_ID}"),
]
READ_ROUTES = [
    ("get", "/partners"),
    ("get", "/defaults"),
    ("get", "/canada"),
]


def _call(http_client, method, path):
    kwargs = {"json": {}} if method in ("put", "post", "patch") else {}
    return getattr(http_client, method)(f"{PRICING}{path}", **kwargs)


class TestPricingRBAC:
    @pytest.mark.parametrize("method, path", WRITE_ROUTES)
    async def test_writes_reject_a_tenant_admin(self, tenant_admin_client, method, path):
        response = await _call(tenant_admin_client, method, path)
        assert response.status_code == 403, f"{method.upper()} {path} not platform-admin gated"

    @pytest.mark.parametrize("method, path", WRITE_ROUTES + READ_ROUTES)
    async def test_all_routes_require_authentication(self, client, method, path):
        response = await _call(client, method, path)
        assert response.status_code == 401, f"{method.upper()} {path} allows anonymous access"

    async def test_reads_are_open_to_any_authenticated_user(self, tenant_admin_client):
        assert (await tenant_admin_client.get(f"{PRICING}/partners")).status_code == 200
        assert (await tenant_admin_client.get(f"{PRICING}/defaults")).status_code == 200


class TestListPartners:
    async def test_lists_active_vendor_tenants(self, platform_admin_client, tenant):
        response = await platform_admin_client.get(f"{PRICING}/partners")

        assert response.status_code == 200
        assert str(tenant.id) in [p["id"] for p in response.json()]

    async def test_excludes_a_driver_tenant(self, platform_admin_client, tenant, driver_tenant):
        response = await platform_admin_client.get(f"{PRICING}/partners")

        assert str(driver_tenant.id) not in [p["id"] for p in response.json()]


class TestDefaultRates:
    async def test_get_returns_the_global_rates(self, platform_admin_client):
        response = await platform_admin_client.get(f"{PRICING}/defaults")

        assert response.status_code == 200
        assert set(RATES).issubset(response.json())

    async def test_update_defaults_persists(self, platform_admin_client):
        update = await platform_admin_client.put(f"{PRICING}/defaults", json=RATES)
        assert update.status_code == 200

        reread = await platform_admin_client.get(f"{PRICING}/defaults")
        assert reread.json()["partner_price_per_km"] == 1.5
        assert reread.json()["individual_price_per_kg"] == 0.75

    async def test_get_defaults_for_a_partner(self, platform_admin_client, tenant):
        response = await platform_admin_client.get(
            f"{PRICING}/defaults", params={"partner_id": str(tenant.id)}
        )

        assert response.status_code == 200

    async def test_get_defaults_404_for_a_non_partner(self, platform_admin_client, driver_tenant):
        response = await platform_admin_client.get(
            f"{PRICING}/defaults", params={"partner_id": str(driver_tenant.id)}
        )

        assert response.status_code == 404


@pytest.fixture
async def canada(db):
    country = Country(name="Canada", code="CA")
    db.add(country)
    await db.flush()
    state = State(name="Ontario", country_id=country.id)
    db.add(state)
    await db.flush()
    city = City(name="Toronto", state_id=state.id)
    db.add(city)
    await db.flush()
    return {"state": state, "city": city}


class TestRegionalRates:
    async def test_lists_canadian_pricing(self, platform_admin_client, canada):
        response = await platform_admin_client.get(f"{PRICING}/canada")

        assert response.status_code == 200
        assert "Ontario" in [s["state_name"] for s in response.json()]

    async def test_update_state_rate(self, platform_admin_client, canada):
        response = await platform_admin_client.put(
            f"{PRICING}/states/{canada['state'].id}", json=RATES
        )

        assert response.status_code == 200
        assert response.json()["updated_state"] == str(canada["state"].id)

    async def test_update_state_404_for_a_non_canadian_state(self, platform_admin_client, canada):
        response = await platform_admin_client.put(
            f"{PRICING}/states/{uuid.uuid4()}", json=RATES
        )

        assert response.status_code == 404

    async def test_update_city_rate(self, platform_admin_client, canada):
        response = await platform_admin_client.put(
            f"{PRICING}/cities/{canada['city'].id}", json=RATES
        )

        assert response.status_code == 200
        assert response.json()["updated_city"] == str(canada["city"].id)

    async def test_update_city_404_for_a_non_canadian_city(self, platform_admin_client, canada):
        response = await platform_admin_client.put(
            f"{PRICING}/cities/{uuid.uuid4()}", json=RATES
        )

        assert response.status_code == 404


class TestPartnerRates:
    async def test_update_partner_defaults(self, platform_admin_client, tenant):
        response = await platform_admin_client.put(
            f"{PRICING}/partners/{tenant.id}/defaults", json=PARTNER_RATES
        )

        assert response.status_code == 200
        assert response.json()["updated_partner"] == str(tenant.id)

    async def test_partner_defaults_404_for_a_non_vendor(self, platform_admin_client, driver_tenant):
        response = await platform_admin_client.put(
            f"{PRICING}/partners/{driver_tenant.id}/defaults", json=PARTNER_RATES
        )

        assert response.status_code == 404

    async def test_update_partner_state_rate(self, platform_admin_client, tenant, canada):
        response = await platform_admin_client.put(
            f"{PRICING}/partners/{tenant.id}/states/{canada['state'].id}", json=PARTNER_RATES
        )

        assert response.status_code == 200
        assert response.json()["updated_state"] == str(canada["state"].id)

    async def test_update_partner_city_rate(self, platform_admin_client, tenant, canada):
        response = await platform_admin_client.put(
            f"{PRICING}/partners/{tenant.id}/cities/{canada['city'].id}", json=PARTNER_RATES
        )

        assert response.status_code == 200
        assert response.json()["updated_city"] == str(canada["city"].id)

    async def test_partner_state_404_for_a_non_canadian_state(
        self, platform_admin_client, tenant, canada
    ):
        response = await platform_admin_client.put(
            f"{PRICING}/partners/{tenant.id}/states/{uuid.uuid4()}", json=PARTNER_RATES
        )

        assert response.status_code == 404
