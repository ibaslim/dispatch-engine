"""Tests for /api/v1/tenants -- tenant-admin self-service.

Damage if these break:
  username check -> signup allows a duplicate/short username
  invite         -> a tenant admin invites into the wrong tenant, or an unsupported role
  suspend        -> a tenant admin cannot pause their own tenant (self-service only)
  invitations    -> one tenant admin reads another company's pending invitations
  status         -> tenant status of another company leaks across the boundary

Note: /suspend and /unsuspend act on the CALLER'S OWN tenant (current_user.tenant_id),
not an arbitrary one -- cross-tenant suspension lives in /platform (platform admin only).
"""
import pytest
from sqlalchemy import select

from app.models.invitation import Invitation
from app.models.tenant import Tenant
from tests.factories import InvitationFactory, TenantFactory
from tests.utils import API

pytestmark = pytest.mark.integration

TENANTS = f"{API}/tenants"


class TestCheckUsername:
    """GET /tenants/check-username/{username} -- public availability check."""

    async def test_available_when_unused(self, client):
        response = await client.get(f"{TENANTS}/check-username/freshname")

        assert response.status_code == 200
        assert response.json()["available"] is True

    async def test_unavailable_when_taken(self, db, client):
        await TenantFactory.create(db, name="Taken Co", username="takenname")

        response = await client.get(f"{TENANTS}/check-username/takenname")

        assert response.json()["available"] is False

    async def test_rejects_a_too_short_username(self, client):
        response = await client.get(f"{TENANTS}/check-username/ab")

        assert response.json()["available"] is False


class TestInviteTenantUser:
    async def test_tenant_admin_invites_into_their_own_tenant(
        self, db, tenant_admin_client, tenant, queued_tasks
    ):
        response = await tenant_admin_client.post(
            f"{TENANTS}/invite", json={"email": "recruit@example.com", "role": "driver"}
        )

        assert response.status_code == 204
        invitation = await db.scalar(
            select(Invitation).where(Invitation.email == "recruit@example.com")
        )
        assert invitation is not None
        assert invitation.tenant_id == tenant.id
        assert "send_invitation_email" in [n for n, _ in queued_tasks]

    async def test_rejects_an_unsupported_role(self, tenant_admin_client):
        response = await tenant_admin_client.post(
            f"{TENANTS}/invite", json={"email": "x@example.com", "role": "wizard"}
        )

        assert response.status_code == 422

    async def test_rejects_a_dispatcher(self, dispatcher_client):
        response = await dispatcher_client.post(
            f"{TENANTS}/invite", json={"email": "x@example.com", "role": "driver"}
        )

        assert response.status_code == 403

    async def test_requires_authentication(self, client):
        response = await client.post(
            f"{TENANTS}/invite", json={"email": "x@example.com", "role": "driver"}
        )

        assert response.status_code == 401


class TestSuspendMyTenant:
    async def test_tenant_admin_suspends_own_tenant(self, db, tenant_admin_client, tenant):
        response = await tenant_admin_client.post(f"{TENANTS}/suspend")

        assert response.status_code == 204
        await db.refresh(tenant)
        assert tenant.is_active is False

    async def test_does_not_touch_another_tenant(
        self, db, tenant_admin_client, tenant, other_tenant
    ):
        await tenant_admin_client.post(f"{TENANTS}/suspend")

        await db.refresh(other_tenant)
        assert other_tenant.is_active is True

    async def test_rejects_a_dispatcher(self, dispatcher_client):
        response = await dispatcher_client.post(f"{TENANTS}/suspend")

        assert response.status_code == 403

    async def test_requires_authentication(self, client):
        response = await client.post(f"{TENANTS}/suspend")

        assert response.status_code == 401


class TestUnsuspendMyTenant:
    async def test_a_suspended_tenants_admin_is_locked_out_of_self_unsuspend(
        self, db, tenant_admin_client, tenant
    ):
        """Design gap: /tenants/unsuspend targets the caller's own tenant, but once that
        tenant is suspended the admin fails the suspended-tenant guard in _get_current_user
        (401) and can never reach it. Self-service unsuspend is therefore unreachable --
        only /platform/tenants/{id}/unsuspend (platform admin) can restore a tenant."""
        tenant.is_active = False
        db.add(tenant)
        await db.flush()

        response = await tenant_admin_client.post(f"{TENANTS}/unsuspend")

        assert response.status_code == 401


class TestListPendingInvitations:
    async def test_returns_own_tenants_pending_invitations(
        self, db, tenant_admin_client, tenant
    ):
        await InvitationFactory.create(db, tenant=tenant, email="mine@example.com")

        response = await tenant_admin_client.get(f"{TENANTS}/invitations")

        assert response.status_code == 200
        assert "mine@example.com" in [i["email"] for i in response.json()]

    async def test_hides_another_tenants_invitations(
        self, db, tenant_admin_client, tenant, other_tenant
    ):
        await InvitationFactory.create(db, tenant=other_tenant, email="rival@example.com")

        response = await tenant_admin_client.get(f"{TENANTS}/invitations")

        assert "rival@example.com" not in [i["email"] for i in response.json()]

    async def test_excludes_used_and_expired_invitations(
        self, db, tenant_admin_client, tenant
    ):
        await InvitationFactory.create(db, tenant=tenant, email="used@example.com", is_used=True)
        await InvitationFactory.create(
            db, tenant=tenant, email="expired@example.com", hours_until_expiry=-1
        )

        response = await tenant_admin_client.get(f"{TENANTS}/invitations")

        emails = [i["email"] for i in response.json()]
        assert "used@example.com" not in emails
        assert "expired@example.com" not in emails

    async def test_platform_admin_sees_every_tenants_invitations(
        self, db, platform_admin_client, tenant, other_tenant
    ):
        await InvitationFactory.create(db, tenant=tenant, email="a@example.com")
        await InvitationFactory.create(db, tenant=other_tenant, email="b@example.com")

        response = await platform_admin_client.get(f"{TENANTS}/invitations")

        emails = [i["email"] for i in response.json()]
        assert "a@example.com" in emails
        assert "b@example.com" in emails

    async def test_rejects_a_dispatcher(self, dispatcher_client):
        response = await dispatcher_client.get(f"{TENANTS}/invitations")

        assert response.status_code == 403


class TestTenantStatuses:
    async def test_returns_status_for_own_tenant(self, tenant_admin_client, tenant):
        response = await tenant_admin_client.get(
            f"{TENANTS}/status", params={"ids": [str(tenant.id)]}
        )

        assert response.status_code == 200
        assert [t["id"] for t in response.json()] == [str(tenant.id)]

    async def test_does_not_return_another_tenants_status(
        self, tenant_admin_client, other_tenant
    ):
        response = await tenant_admin_client.get(
            f"{TENANTS}/status", params={"ids": [str(other_tenant.id)]}
        )

        assert response.status_code == 200
        assert response.json() == []

    async def test_returns_empty_without_ids(self, tenant_admin_client):
        response = await tenant_admin_client.get(f"{TENANTS}/status")

        assert response.json() == []

    async def test_platform_admin_can_read_any_tenant_status(
        self, platform_admin_client, other_tenant
    ):
        response = await platform_admin_client.get(
            f"{TENANTS}/status", params={"ids": [str(other_tenant.id)]}
        )

        assert [t["id"] for t in response.json()] == [str(other_tenant.id)]
