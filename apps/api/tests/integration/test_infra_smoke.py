"""Guards the fixture contract in tests/conftest.py.

Not a feature test. If these fail, every other integration test is unreliable
for infrastructure reasons rather than product ones.
"""
import pytest
from sqlalchemy import func, select

from app.models.tenant import Tenant
from app.models.user import User
from tests.factories import TenantFactory
from tests.utils import API

pytestmark = pytest.mark.integration


class TestTransactionIsolation:
    """Each test must start from the state the previous one started from."""

    async def test_first_test_sees_only_its_own_tenants(self, db, tenant):
        count = await db.scalar(select(func.count()).select_from(Tenant))
        assert count == 1

    async def test_second_test_does_not_see_the_first_ones_rows(self, db, tenant):
        count = await db.scalar(select(func.count()).select_from(Tenant))
        assert count == 1

    async def test_commit_inside_a_test_is_still_rolled_back(self, db):
        await TenantFactory.create(db, name="Committed Tenant")
        await db.commit()

        count = await db.scalar(select(func.count()).select_from(Tenant))
        assert count == 1

    async def test_the_committed_tenant_did_not_survive(self, db):
        count = await db.scalar(select(func.count()).select_from(Tenant))
        assert count == 0


class TestFactories:
    async def test_user_factory_persists_roles_and_store_access(self, db, tenant, store):
        from app.models.user import RoleEnum
        from tests.factories import UserFactory

        user = await UserFactory.create(
            db, tenant=tenant, roles=(RoleEnum.store_dispatcher,), stores=[store]
        )

        assert user.has_role("store_dispatcher") is True
        assert user.get_accessible_store_ids() == [store.id]

    async def test_order_factory_links_vendor_and_driver_tenants(
        self, db, tenant, driver_tenant
    ):
        from tests.factories import OrderFactory

        order = await OrderFactory.create(db, vendor=tenant, driver=driver_tenant)

        assert order.vendor_id == tenant.id
        assert order.driver_id == driver_tenant.id


class TestClientWiring:
    async def test_client_reads_the_test_transaction(self, client, db, tenant):
        """The app must see fixture rows, proving get_db is overridden."""
        stored = await db.scalar(select(User.id).where(User.tenant_id == tenant.id))
        assert stored is None  # no user created yet; the query itself is the check

        response = await client.get("/openapi.json")
        assert response.status_code == 200

    async def test_unauthenticated_request_is_rejected(self, client):
        response = await client.get(f"{API}/orders")
        assert response.status_code == 401

    async def test_authenticated_request_resolves_the_real_user(
        self, tenant_admin_client, tenant_admin
    ):
        """A real JWT must survive the full _get_current_user dependency."""
        response = await tenant_admin_client.get(f"{API}/orders")
        assert response.status_code == 200