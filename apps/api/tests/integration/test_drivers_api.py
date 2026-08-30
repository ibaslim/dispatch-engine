"""Tests for /api/v1/drivers.

Damage if these break:
  profile list   -> a non-admin reads the full driver roster (PII: contact, address)
  available list -> inactive drivers, or non-driver tenants, are offered for assignment
  push token     -> a stale device keeps receiving another driver's job pushes
  location write -> a non-driver writes into the live-tracking channel
  location read  -> anyone reads a driver's live GPS position

Note: GET /{driver_id}/location currently has NO auth dependency at all -- that is a
live bug (see DISCOVERED_BUGS.md, "To review" / BUG-006), pinned below with strict xfail.
"""
import uuid

import pytest

from app.models.tenant import TenantRole
from app.models.token import PushToken
from app.models.user import RoleEnum
from sqlalchemy import select
from tests.factories import TenantFactory, UserFactory
from tests.utils import API

pytestmark = pytest.mark.integration

DRIVERS = f"{API}/drivers"


class TestListDriverProfiles:
    """GET /drivers -- platform admin only; returns the driver roster with PII."""

    async def test_platform_admin_lists_driver_tenants(self, platform_admin_client, driver_tenant):
        response = await platform_admin_client.get(DRIVERS)

        assert response.status_code == 200
        assert str(driver_tenant.id) in [d["id"] for d in response.json()]

    async def test_excludes_non_driver_tenants(self, platform_admin_client, driver_tenant, tenant):
        response = await platform_admin_client.get(DRIVERS)

        ids = [d["id"] for d in response.json()]
        assert str(driver_tenant.id) in ids
        assert str(tenant.id) not in ids  # `tenant` is a vendor

    async def test_rejects_a_tenant_user(self, tenant_admin_client):
        response = await tenant_admin_client.get(DRIVERS)

        assert response.status_code == 403

    async def test_requires_authentication(self, client):
        response = await client.get(DRIVERS)

        assert response.status_code == 401


class TestAvailableDrivers:
    """GET /drivers/available -- any authenticated user; active driver tenants only."""

    async def test_lists_only_active_driver_tenants(
        self, db, tenant_admin_client, tenant
    ):
        active = await TenantFactory.create(db, name="Active Driver", role=TenantRole.driver)
        inactive = await TenantFactory.create(
            db, name="Offline Driver", role=TenantRole.driver, is_active=False
        )

        response = await tenant_admin_client.get(f"{DRIVERS}/available")

        assert response.status_code == 200
        ids = [d["id"] for d in response.json()]
        assert str(active.id) in ids
        assert str(inactive.id) not in ids
        assert str(tenant.id) not in ids  # vendor tenant

    async def test_requires_authentication(self, client):
        response = await client.get(f"{DRIVERS}/available")

        assert response.status_code == 401


class TestMyJobs:
    async def test_returns_a_list_for_an_authenticated_driver(self, driver_client):
        response = await driver_client.get(f"{DRIVERS}/me/jobs")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_requires_authentication(self, client):
        response = await client.get(f"{DRIVERS}/me/jobs")

        assert response.status_code == 401


class TestRegisterPushToken:
    """POST /drivers/me/push-token -- stores the caller's device token."""

    async def test_registers_a_new_token_for_the_caller(self, db, driver_client, driver):
        response = await driver_client.post(
            f"{DRIVERS}/me/push-token", json={"token": "device-abc", "platform": "ios"}
        )

        assert response.status_code == 204
        stored = await db.scalar(
            select(PushToken).where(PushToken.user_id == driver.id, PushToken.token == "device-abc")
        )
        assert stored is not None
        assert stored.is_active is True
        assert stored.platform == "ios"

    async def test_deactivates_the_callers_previous_tokens(self, db, driver_client, driver):
        db.add(PushToken(user_id=driver.id, token="old-device", platform="android", is_active=True))
        await db.flush()

        await driver_client.post(
            f"{DRIVERS}/me/push-token", json={"token": "new-device", "platform": "android"}
        )

        old = await db.scalar(select(PushToken).where(PushToken.token == "old-device"))
        assert old.is_active is False

    async def test_ignores_a_request_without_a_token(self, db, driver_client, driver):
        response = await driver_client.post(f"{DRIVERS}/me/push-token", json={})

        assert response.status_code == 204
        assert await db.scalar(select(PushToken).where(PushToken.user_id == driver.id)) is None

    async def test_requires_authentication(self, client):
        response = await client.post(f"{DRIVERS}/me/push-token", json={"token": "x"})

        assert response.status_code == 401


class TestPushDriverLocation:
    """POST /drivers/me/location -- the driver's own live-location heartbeat."""

    async def test_driver_records_a_location(self, driver_client, platform_admin_client, driver_tenant):
        response = await driver_client.post(
            f"{DRIVERS}/me/location", json={"lat": 43.65, "lng": -79.38}
        )

        assert response.status_code == 204
        # Read it back through the public read endpoint.
        read = await platform_admin_client.get(f"{DRIVERS}/{driver_tenant.id}/location")
        assert read.status_code == 200
        assert read.json()["lat"] == 43.65
        assert read.json()["lng"] == -79.38

    async def test_rejects_a_user_without_a_driver_tenant(self, platform_admin_client):
        # platform admin has no tenant_id, so cannot be a driver heartbeat source.
        response = await platform_admin_client.post(
            f"{DRIVERS}/me/location", json={"lat": 1.0, "lng": 1.0}
        )

        assert response.status_code == 400

    async def test_requires_authentication(self, client):
        response = await client.post(f"{DRIVERS}/me/location", json={"lat": 1.0, "lng": 1.0})

        assert response.status_code == 401


class TestClearDriverLocation:
    async def test_driver_clears_its_location(self, driver_client, platform_admin_client, driver_tenant):
        await driver_client.post(f"{DRIVERS}/me/location", json={"lat": 43.65, "lng": -79.38})

        response = await driver_client.delete(f"{DRIVERS}/me/location")

        assert response.status_code == 204
        read = await platform_admin_client.get(f"{DRIVERS}/{driver_tenant.id}/location")
        assert read.status_code == 404

    async def test_requires_authentication(self, client):
        response = await client.delete(f"{DRIVERS}/me/location")

        assert response.status_code == 401


class TestGetDriverLocation:
    """GET /drivers/{driver_id}/location.

    NOTE: this route currently takes no auth dependency (see BUG-006). The happy-path
    and 404 tests authenticate anyway, so they survive the fix; the leak is pinned by a
    strict xfail below.
    """

    async def test_returns_404_when_the_driver_is_offline(self, platform_admin_client):
        response = await platform_admin_client.get(f"{DRIVERS}/{uuid.uuid4()}/location")

        assert response.status_code == 404

    async def test_returns_the_location_when_online(
        self, driver_client, platform_admin_client, driver_tenant
    ):
        await driver_client.post(f"{DRIVERS}/me/location", json={"lat": 43.65, "lng": -79.38})

        response = await platform_admin_client.get(f"{DRIVERS}/{driver_tenant.id}/location")

        assert response.status_code == 200
        assert response.json()["driver_id"] == str(driver_tenant.id)

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY (DISCOVERED_BUGS.md BUG-006): get_driver_location has no auth "
        "dependency, so anyone with a driver UUID reads live GPS. An unauthenticated "
        "request should be rejected. Remove this marker once the route requires auth.",
    )
    async def test_unauthenticated_request_is_rejected(
        self, driver_client, client, driver_tenant
    ):
        # Driver goes online...
        await driver_client.post(f"{DRIVERS}/me/location", json={"lat": 43.65, "lng": -79.38})

        # ...and an unauthenticated stranger reads the position.
        response = await client.get(f"{DRIVERS}/{driver_tenant.id}/location")

        assert response.status_code == 401
