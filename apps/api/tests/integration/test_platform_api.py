"""Tests for /api/v1/platform -- platform-admin-only tenant administration.

Damage if these break:
  invite     -> a non-admin provisions tenants, or invites go nowhere
  suspend    -> one actor disables another company's tenant, or suspension is silently ignored
  unsuspend  -> a suspended tenant cannot be restored
  RBAC       -> any of the above becomes reachable without platform-admin rights
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.invitation import Invitation
from tests.factories import TenantFactory
from tests.utils import API

pytestmark = pytest.mark.integration

PLATFORM = f"{API}/platform"


class TestInviteTenantAdmin:
    async def test_platform_admin_creates_an_invitation(
        self, db, platform_admin_client, queued_tasks
    ):
        response = await platform_admin_client.post(
            f"{PLATFORM}/tenants/invite",
            json={"email": "owner@newco.com", "name": "New Owner", "tenant_name": "Brand New Co"},
        )

        assert response.status_code == 204
        invitation = await db.scalar(
            select(Invitation).where(Invitation.email == "owner@newco.com")
        )
        assert invitation is not None
        assert "send_invitation_email" in [n for n, _ in queued_tasks]

    async def test_rejects_a_tenant_admin(self, tenant_admin_client):
        response = await tenant_admin_client.post(
            f"{PLATFORM}/tenants/invite",
            json={"email": "x@example.com", "name": "X", "tenant_name": "Y"},
        )

        assert response.status_code == 403

    async def test_requires_authentication(self, client):
        response = await client.post(
            f"{PLATFORM}/tenants/invite",
            json={"email": "x@example.com", "name": "X", "tenant_name": "Y"},
        )

        assert response.status_code == 401


class TestSuspendTenant:
    async def test_platform_admin_suspends_a_tenant(
        self, db, platform_admin_client, other_tenant, queued_tasks
    ):
        response = await platform_admin_client.post(
            f"{PLATFORM}/tenants/{other_tenant.id}/suspend", json={"reason": "fraud review"}
        )

        assert response.status_code == 204
        await db.refresh(other_tenant)
        assert other_tenant.is_active is False
        assert "send_tenant_suspended_email" in [n for n, _ in queued_tasks]

    async def test_returns_404_for_an_unknown_tenant(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{PLATFORM}/tenants/{uuid.uuid4()}/suspend", json={"reason": "x"}
        )

        assert response.status_code == 404

    async def test_rejects_a_tenant_admin(self, db, tenant_admin_client, other_tenant):
        response = await tenant_admin_client.post(
            f"{PLATFORM}/tenants/{other_tenant.id}/suspend", json={"reason": "x"}
        )

        assert response.status_code == 403
        await db.refresh(other_tenant)
        assert other_tenant.is_active is True

    async def test_requires_authentication(self, client, other_tenant):
        response = await client.post(
            f"{PLATFORM}/tenants/{other_tenant.id}/suspend", json={"reason": "x"}
        )

        assert response.status_code == 401


class TestUnsuspendTenant:
    async def test_platform_admin_reactivates_a_tenant(self, db, platform_admin_client):
        suspended = await TenantFactory.create(db, name="Dormant Co", is_active=False)

        response = await platform_admin_client.post(
            f"{PLATFORM}/tenants/{suspended.id}/unsuspend"
        )

        assert response.status_code == 204
        await db.refresh(suspended)
        assert suspended.is_active is True

    async def test_returns_404_for_an_unknown_tenant(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{PLATFORM}/tenants/{uuid.uuid4()}/unsuspend"
        )

        assert response.status_code == 404

    async def test_rejects_a_tenant_admin(self, tenant_admin_client, other_tenant):
        response = await tenant_admin_client.post(
            f"{PLATFORM}/tenants/{other_tenant.id}/unsuspend"
        )

        assert response.status_code == 403
