"""Tests for /api/v1/driver-payroll.

Auth split: GET routes are open to any authenticated user (CurrentUser); every write is
platform-admin only (PlatformAdmin). Damage if these break:
  RBAC          -> a tenant user rewrites driver pay rules or per-region salaries
  payment group -> a driver silently lands in two pay groups, or an invalid rule saves
  compensation  -> a non-driver tenant gets payroll rows, or updates hit the wrong scope
"""
import uuid
from decimal import Decimal

import pytest

from app.models.location import (
    City,
    Country,
    DEFAULT_DRIVER_BASE_SALARY,
    DriverPricing,
    State,
)
from app.models.tenant import TenantRole
from tests.factories import TenantFactory
from tests.utils import API

pytestmark = pytest.mark.integration

PAYROLL = f"{API}/driver-payroll"
_ID = str(uuid.uuid4())

WRITE_ROUTES = [
    ("post", "/groups"),
    ("put", f"/groups/{_ID}"),
    ("delete", f"/groups/{_ID}"),
    ("put", f"/drivers/{_ID}/defaults"),
    ("put", f"/drivers/{_ID}/states/{_ID}"),
    ("put", f"/drivers/{_ID}/cities/{_ID}"),
]
READ_ROUTES = [
    ("get", "/groups"),
    ("get", "/drivers"),
    ("get", f"/drivers/{_ID}/defaults"),
    ("get", f"/drivers/{_ID}/canada"),
]


def _call(http_client, method, path):
    kwargs = {"json": {}} if method in ("post", "put", "patch") else {}
    return getattr(http_client, method)(f"{PAYROLL}{path}", **kwargs)


class TestPayrollRBAC:
    @pytest.mark.parametrize("method, path", WRITE_ROUTES)
    async def test_writes_reject_a_tenant_admin(self, tenant_admin_client, method, path):
        response = await _call(tenant_admin_client, method, path)
        assert response.status_code == 403, f"{method.upper()} {path} not platform-admin gated"

    @pytest.mark.parametrize("method, path", WRITE_ROUTES + READ_ROUTES)
    async def test_all_routes_require_authentication(self, client, method, path):
        response = await _call(client, method, path)
        assert response.status_code == 401, f"{method.upper()} {path} allows anonymous access"

    async def test_reads_are_open_to_any_authenticated_user(self, tenant_admin_client):
        assert (await tenant_admin_client.get(f"{PAYROLL}/groups")).status_code == 200
        assert (await tenant_admin_client.get(f"{PAYROLL}/drivers")).status_code == 200


class TestPaymentGroups:
    async def test_create_a_fixed_group(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={"name": "Standard Pay", "rule_type": "fixed", "fixed_amount": "12.50"},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Standard Pay"
        assert Decimal(str(body["fixed_amount"])) == Decimal("12.50")

    async def test_fixed_rule_requires_an_amount(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{PAYROLL}/groups", json={"name": "Bad Fixed", "rule_type": "fixed"}
        )

        assert response.status_code == 422

    async def test_percentage_rule_requires_a_percentage(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{PAYROLL}/groups", json={"name": "Bad Pct", "rule_type": "percentage"}
        )

        assert response.status_code == 422

    async def test_rejects_a_duplicate_name(self, platform_admin_client):
        await platform_admin_client.post(
            f"{PAYROLL}/groups", json={"name": "Dup", "rule_type": "fixed", "fixed_amount": "5.00"}
        )

        response = await platform_admin_client.post(
            f"{PAYROLL}/groups", json={"name": "dup", "rule_type": "fixed", "fixed_amount": "6.00"}
        )

        assert response.status_code == 409

    async def test_assigns_a_driver(self, platform_admin_client, driver_tenant):
        response = await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={
                "name": "With Driver",
                "rule_type": "fixed",
                "fixed_amount": "10.00",
                "driver_ids": [str(driver_tenant.id)],
            },
        )

        assert response.status_code == 201
        assert [d["id"] for d in response.json()["drivers"]] == [str(driver_tenant.id)]

    async def test_reassignment_conflict_needs_confirmation(
        self, platform_admin_client, driver_tenant
    ):
        await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={
                "name": "Group A", "rule_type": "fixed", "fixed_amount": "10.00",
                "driver_ids": [str(driver_tenant.id)],
            },
        )

        response = await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={
                "name": "Group B", "rule_type": "fixed", "fixed_amount": "11.00",
                "driver_ids": [str(driver_tenant.id)],
            },
        )

        assert response.status_code == 409

    async def test_reassignment_succeeds_with_confirmation(
        self, platform_admin_client, driver_tenant
    ):
        await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={
                "name": "Group C", "rule_type": "fixed", "fixed_amount": "10.00",
                "driver_ids": [str(driver_tenant.id)],
            },
        )

        response = await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={
                "name": "Group D", "rule_type": "fixed", "fixed_amount": "11.00",
                "driver_ids": [str(driver_tenant.id)], "confirm_reassignments": True,
            },
        )

        assert response.status_code == 201
        assert [d["id"] for d in response.json()["drivers"]] == [str(driver_tenant.id)]

    async def test_rejects_an_invalid_driver_id(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{PAYROLL}/groups",
            json={
                "name": "Ghost Drivers", "rule_type": "fixed", "fixed_amount": "10.00",
                "driver_ids": [str(uuid.uuid4())],
            },
        )

        assert response.status_code == 400

    async def test_delete_a_group(self, platform_admin_client):
        create = await platform_admin_client.post(
            f"{PAYROLL}/groups", json={"name": "Temp", "rule_type": "fixed", "fixed_amount": "5.00"}
        )
        group_id = create.json()["id"]

        response = await platform_admin_client.delete(f"{PAYROLL}/groups/{group_id}")

        assert response.status_code == 204

    async def test_delete_unknown_returns_404(self, platform_admin_client):
        response = await platform_admin_client.delete(f"{PAYROLL}/groups/{uuid.uuid4()}")

        assert response.status_code == 404


class TestDriverCompensation:
    async def test_lists_active_drivers(self, platform_admin_client, driver_tenant):
        response = await platform_admin_client.get(f"{PAYROLL}/drivers")

        assert response.status_code == 200
        assert str(driver_tenant.id) in [d["id"] for d in response.json()]

    async def test_defaults_fall_back_to_the_platform_default(
        self, platform_admin_client, driver_tenant
    ):
        response = await platform_admin_client.get(f"{PAYROLL}/drivers/{driver_tenant.id}/defaults")

        assert response.status_code == 200
        assert response.json()["base_salary"] == DEFAULT_DRIVER_BASE_SALARY

    async def test_defaults_404_for_a_non_driver(self, platform_admin_client, tenant):
        response = await platform_admin_client.get(f"{PAYROLL}/drivers/{tenant.id}/defaults")

        assert response.status_code == 404

    async def test_update_defaults_persists(self, db, platform_admin_client, driver_tenant):
        response = await platform_admin_client.put(
            f"{PAYROLL}/drivers/{driver_tenant.id}/defaults",
            json={"base_salary": 800, "commission_per_delivery": 3.5},
        )
        assert response.status_code == 200

        reread = await platform_admin_client.get(f"{PAYROLL}/drivers/{driver_tenant.id}/defaults")
        assert reread.json()["base_salary"] == 800
        assert reread.json()["commission_per_delivery"] == 3.5

    async def test_update_defaults_404_for_a_non_driver(self, platform_admin_client, tenant):
        response = await platform_admin_client.put(
            f"{PAYROLL}/drivers/{tenant.id}/defaults",
            json={"base_salary": 800, "commission_per_delivery": 3.5},
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


class TestDriverRegionalPayroll:
    async def test_lists_canadian_payroll_for_a_driver(
        self, platform_admin_client, driver_tenant, canada
    ):
        response = await platform_admin_client.get(f"{PAYROLL}/drivers/{driver_tenant.id}/canada")

        assert response.status_code == 200
        assert "Ontario" in [s["state_name"] for s in response.json()]

    async def test_update_state_rate(self, platform_admin_client, driver_tenant, canada):
        response = await platform_admin_client.put(
            f"{PAYROLL}/drivers/{driver_tenant.id}/states/{canada['state'].id}",
            json={"base_salary": 900, "commission_per_delivery": 4.0},
        )

        assert response.status_code == 200
        assert response.json()["updated_state"] == str(canada["state"].id)

    async def test_update_state_404_for_a_non_canadian_state(
        self, platform_admin_client, driver_tenant, canada
    ):
        response = await platform_admin_client.put(
            f"{PAYROLL}/drivers/{driver_tenant.id}/states/{uuid.uuid4()}",
            json={"base_salary": 900, "commission_per_delivery": 4.0},
        )

        assert response.status_code == 404

    async def test_update_city_rate(self, platform_admin_client, driver_tenant, canada):
        response = await platform_admin_client.put(
            f"{PAYROLL}/drivers/{driver_tenant.id}/cities/{canada['city'].id}",
            json={"base_salary": 950, "commission_per_delivery": 4.5},
        )

        assert response.status_code == 200
        assert response.json()["updated_city"] == str(canada["city"].id)

    async def test_update_city_404_for_a_non_canadian_city(
        self, platform_admin_client, driver_tenant, canada
    ):
        response = await platform_admin_client.put(
            f"{PAYROLL}/drivers/{driver_tenant.id}/cities/{uuid.uuid4()}",
            json={"base_salary": 950, "commission_per_delivery": 4.5},
        )

        assert response.status_code == 404
