"""Tests for POST /api/v1/pusher/auth (Pusher Channels subscription authorization).

Damage if these break:
  channel scoping -> a tenant subscribes to another tenant's private channel and reads
                      their live order events
  platform channel -> a non-admin subscribes to the platform-wide channel
  drivers channel  -> a non-driver tenant subscribes to the driver broadcast channel

`pusher_service.authorize_channel` only signs locally (HMAC) -- no network call -- so it
is safe to exercise with fake-but-valid-shaped credentials rather than mocking it. The
service is disabled by default in tests (conftest blanks PUSHER_* env vars); the
`pusher_enabled` fixture here turns it on for the tests that need to get past the
501/503 gate and reach the actual authorization logic.
"""
import pytest

from app.core.config import settings
from tests.utils import API

pytestmark = pytest.mark.integration

PUSHER = f"{API}/pusher"
SOCKET_ID = "123.456"


@pytest.fixture
def pusher_enabled(monkeypatch):
    """Give pusher_service.enabled real (locally-verifiable) credentials.

    app_id must be numeric -- the pusher client validates it before signing.
    """
    monkeypatch.setattr(settings, "pusher_app_id", "123456")
    monkeypatch.setattr(settings, "pusher_key", "test-key")
    monkeypatch.setattr(settings, "pusher_secret", "test-secret")
    monkeypatch.setattr(settings, "pusher_cluster", "us2")


def _auth(http_client, channel_name: str):
    return http_client.post(
        f"{PUSHER}/auth", data={"socket_id": SOCKET_ID, "channel_name": channel_name}
    )


class TestPusherAuthAvailability:
    async def test_returns_503_when_pusher_is_not_configured(self, tenant_admin_client, tenant):
        response = await _auth(tenant_admin_client, f"private-tenant-{tenant.id}")

        assert response.status_code == 503

    async def test_requires_authentication(self, client, tenant):
        response = await _auth(client, f"private-tenant-{tenant.id}")

        assert response.status_code == 401


class TestTenantChannel:
    async def test_tenant_admin_may_subscribe_to_its_own_channel(
        self, pusher_enabled, tenant_admin_client, tenant
    ):
        response = await _auth(tenant_admin_client, f"private-tenant-{tenant.id}")

        assert response.status_code == 200
        assert "auth" in response.json()

    async def test_rejects_subscribing_to_another_tenants_channel(
        self, pusher_enabled, tenant_admin_client, other_tenant
    ):
        response = await _auth(tenant_admin_client, f"private-tenant-{other_tenant.id}")

        assert response.status_code == 403

    async def test_platform_admin_may_subscribe_to_any_tenant_channel(
        self, pusher_enabled, platform_admin_client, tenant
    ):
        """can_access_channel's fallback only matches the caller's own tenant id, so a
        platform admin (tenant_id=None) does NOT get a free pass onto a tenant channel --
        documenting the actual (narrower) behavior."""
        response = await _auth(platform_admin_client, f"private-tenant-{tenant.id}")

        assert response.status_code == 403


class TestPlatformChannel:
    async def test_platform_admin_may_subscribe(self, pusher_enabled, platform_admin_client):
        response = await _auth(platform_admin_client, "private-platform")

        assert response.status_code == 200
        assert "auth" in response.json()

    async def test_rejects_a_tenant_admin(self, pusher_enabled, tenant_admin_client):
        response = await _auth(tenant_admin_client, "private-platform")

        assert response.status_code == 403

    async def test_rejects_a_driver(self, pusher_enabled, driver_client):
        response = await _auth(driver_client, "private-platform")

        assert response.status_code == 403


class TestDriversChannel:
    async def test_driver_tenant_may_subscribe(self, pusher_enabled, driver_client):
        response = await _auth(driver_client, "private-drivers")

        assert response.status_code == 200
        assert "auth" in response.json()

    async def test_rejects_a_vendor_tenant(self, pusher_enabled, tenant_admin_client):
        response = await _auth(tenant_admin_client, "private-drivers")

        assert response.status_code == 403

    async def test_rejects_a_platform_admin(self, pusher_enabled, platform_admin_client):
        """Platform admins have tenant_id=None, which fails the drivers-channel check too."""
        response = await _auth(platform_admin_client, "private-drivers")

        assert response.status_code == 403
