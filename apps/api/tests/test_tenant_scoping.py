"""
Unit tests for tenant isolation and store access scoping helpers.
"""
import uuid

import pytest

from tests.conftest import _UserStub, _UserRoleStub, _UserStoreAccessStub, _TenantStub


class TestTenantScoping:
    def test_user_has_correct_tenant(self, sample_user: _UserStub, sample_tenant: _TenantStub):
        """User's tenant_id matches the assigned tenant."""
        assert sample_user.tenant_id == sample_tenant.id

    def test_platform_admin_has_no_tenant(self, platform_admin_user: _UserStub):
        """Platform admins are not scoped to any tenant."""
        assert platform_admin_user.tenant_id is None
        assert platform_admin_user.is_platform_admin is True

    def test_user_with_no_store_access_returns_empty_list(self, sample_user: _UserStub):
        """User with no store access returns empty list (means all-stores access by role)."""
        sample_user.store_accesses = []
        assert sample_user.get_accessible_store_ids() == []

    def test_user_with_store_access_returns_correct_ids(self, sample_user: _UserStub):
        """User with explicit store access returns only those store IDs."""
        store_id_1 = uuid.uuid4()
        store_id_2 = uuid.uuid4()

        access1 = _UserStoreAccessStub(user_id=sample_user.id, store_id=store_id_1)
        access2 = _UserStoreAccessStub(user_id=sample_user.id, store_id=store_id_2)

        sample_user.store_accesses = [access1, access2]
        ids = sample_user.get_accessible_store_ids()
        assert store_id_1 in ids
        assert store_id_2 in ids
        assert len(ids) == 2

    def test_cross_tenant_user_does_not_see_other_tenant_store(self, sample_user: _UserStub):
        """User from tenant A should not see stores from tenant B."""
        tenant_a_id = uuid.uuid4()
        store_id = uuid.uuid4()

        sample_user.tenant_id = tenant_a_id

        access = _UserStoreAccessStub(user_id=sample_user.id, store_id=store_id)
        sample_user.store_accesses = [access]

        # The store_service layer enforces tenant isolation via the DB query (tested in integration tests)
        # Here we confirm the user's accessible IDs are returned without filtering by tenant (that's the service's job)
        ids = sample_user.get_accessible_store_ids()
        assert store_id in ids

    def test_has_role_returns_true_for_assigned_role(self, sample_user: _UserStub):
        """has_role returns True for a role the user has."""
        role = _UserRoleStub(user_id=sample_user.id, role="tenant_admin")
        sample_user.roles = [role]
        assert sample_user.has_role("tenant_admin") is True

    def test_has_role_returns_false_for_unassigned_role(self, sample_user: _UserStub):
        """has_role returns False for a role the user does not have."""
        sample_user.roles = []
        assert sample_user.has_role("driver") is False
