"""Unit tests for the pure scoping helpers on the real User model.

Actual cross-tenant enforcement lives in the routers and services and is proven
in tests/integration/, not here -- these methods only report what a user is
attached to.
"""
import uuid

from app.models.tenant import Tenant, TenantRole
from app.models.user import RoleEnum, User, UserRole, UserStoreAccess


def _user(**kwargs) -> User:
    """An unsaved User; has_role and get_accessible_store_ids need no session."""
    kwargs.setdefault("email", "user@test.com")
    kwargs.setdefault("name", "Test User")
    return User(**kwargs)


class TestHasRole:
    def test_returns_true_for_assigned_role(self):
        user = _user()
        user.roles = [UserRole(role=RoleEnum.tenant_admin)]
        assert user.has_role("tenant_admin") is True

    def test_returns_false_for_unassigned_role(self):
        user = _user()
        user.roles = [UserRole(role=RoleEnum.driver)]
        assert user.has_role("tenant_admin") is False

    def test_returns_false_when_user_has_no_roles(self):
        assert _user().has_role("tenant_admin") is False

    def test_finds_role_among_several(self):
        user = _user()
        user.roles = [
            UserRole(role=RoleEnum.driver),
            UserRole(role=RoleEnum.central_dispatcher),
        ]
        assert user.has_role("central_dispatcher") is True


class TestAccessibleStoreIds:
    def test_returns_empty_when_no_explicit_access(self):
        """Empty means 'not store-restricted', not 'no access'."""
        assert _user().get_accessible_store_ids() == []

    def test_returns_only_granted_store_ids(self):
        user = _user()
        granted = [uuid.uuid4(), uuid.uuid4()]
        ungranted = uuid.uuid4()
        user.store_accesses = [UserStoreAccess(store_id=sid) for sid in granted]

        accessible = user.get_accessible_store_ids()

        assert sorted(accessible, key=str) == sorted(granted, key=str)
        assert ungranted not in accessible


class TestTenantAttachment:
    def test_user_carries_its_tenant_id(self):
        tenant = Tenant(name="Test Tenant", slug="test-tenant", role=TenantRole.vendor)
        tenant.id = uuid.uuid4()
        user = _user(tenant_id=tenant.id)
        assert user.tenant_id == tenant.id

    def test_platform_admin_is_unscoped(self):
        admin = _user(email="admin@platform.com", is_platform_admin=True)
        assert admin.tenant_id is None
        assert admin.is_platform_admin is True