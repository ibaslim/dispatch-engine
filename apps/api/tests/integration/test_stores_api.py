"""Tests for GET/POST /api/v1/stores."""
import pytest
from sqlalchemy import select

from app.models.store import Store
from app.models.user import RoleEnum
from tests.factories import StoreFactory, UserFactory
from tests.utils import API

pytestmark = pytest.mark.integration


class TestListStores:
    async def test_returns_stores_in_my_tenant(self, tenant_admin_client, store):
        response = await tenant_admin_client.get(f"{API}/stores")

        assert response.status_code == 200
        assert [s["id"] for s in response.json()] == [str(store.id)]

    async def test_hides_stores_belonging_to_another_tenant(
        self, db, tenant_admin_client, store, other_tenant
    ):
        await StoreFactory.create(db, tenant=other_tenant, name="Rival Store")

        response = await tenant_admin_client.get(f"{API}/stores")

        returned = [s["name"] for s in response.json()]
        assert returned == [store.name]
        assert "Rival Store" not in returned

    async def test_hides_inactive_stores(self, db, tenant_admin_client, tenant):
        await StoreFactory.create(db, tenant=tenant, name="Closed Store", is_active=False)

        response = await tenant_admin_client.get(f"{API}/stores")

        assert [s["name"] for s in response.json()] == []

    async def test_store_dispatcher_sees_only_assigned_stores(
        self, db, authenticate, tenant, store
    ):
        assigned = await StoreFactory.create(db, tenant=tenant, name="Assigned Store")
        dispatcher = await UserFactory.create(
            db, tenant=tenant, roles=(RoleEnum.store_dispatcher,), stores=[assigned]
        )

        response = await authenticate(dispatcher).get(f"{API}/stores")

        assert [s["name"] for s in response.json()] == ["Assigned Store"]

    async def test_platform_admin_sees_every_tenants_stores(
        self, db, platform_admin_client, store, other_tenant
    ):
        await StoreFactory.create(db, tenant=other_tenant, name="Rival Store")

        response = await platform_admin_client.get(f"{API}/stores")

        assert {s["name"] for s in response.json()} == {store.name, "Rival Store"}

    async def test_requires_authentication(self, client):
        response = await client.get(f"{API}/stores")

        assert response.status_code == 401


class TestCreateStore:
    async def test_persists_the_store_to_my_tenant(self, db, tenant_admin_client, tenant):
        response = await tenant_admin_client.post(
            f"{API}/stores", json={"name": "New Store", "address": "5 Main St"}
        )

        assert response.status_code == 200
        assert response.json()["tenant_id"] == str(tenant.id)

        stored = await db.scalar(select(Store).where(Store.name == "New Store"))
        assert stored is not None
        assert stored.tenant_id == tenant.id

    async def test_rejects_a_dispatcher(self, db, authenticate, tenant):
        dispatcher = await UserFactory.create(
            db, tenant=tenant, roles=(RoleEnum.central_dispatcher,)
        )

        response = await authenticate(dispatcher).post(
            f"{API}/stores", json={"name": "Sneaky Store"}
        )

        assert response.status_code == 403
        assert await db.scalar(select(Store).where(Store.name == "Sneaky Store")) is None
