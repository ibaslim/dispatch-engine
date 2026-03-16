"""
Test configuration and fixtures.
Uses SQLite for unit tests (no DB needed for logic tests).
For integration tests requiring DB, use pytest-asyncio with an actual test DB.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import pytest

from app.models.invitation import Invitation
from app.models.user import User, UserRole
from app.models.tenant import Tenant


@pytest.fixture
def sample_tenant() -> Tenant:
    tenant = Tenant.__new__(Tenant)
    tenant.id = uuid.uuid4()
    tenant.name = "Test Tenant"
    tenant.slug = "test-tenant"
    tenant.is_active = True
    return tenant


@pytest.fixture
def sample_user(sample_tenant: Tenant) -> User:
    user = User.__new__(User)
    user.id = uuid.uuid4()
    user.email = "user@test.com"
    user.name = "Test User"
    user.hashed_password = "$2b$12$placeholder"
    user.is_active = True
    user.is_platform_admin = False
    user.tenant_id = sample_tenant.id
    user.roles = []
    user.store_accesses = []
    user.refresh_tokens = []
    user.push_tokens = []
    return user


@pytest.fixture
def platform_admin_user() -> User:
    user = User.__new__(User)
    user.id = uuid.uuid4()
    user.email = "admin@platform.com"
    user.name = "Platform Admin"
    user.hashed_password = "$2b$12$placeholder"
    user.is_active = True
    user.is_platform_admin = True
    user.tenant_id = None
    user.roles = []
    user.store_accesses = []
    user.refresh_tokens = []
    user.push_tokens = []
    return user


def make_invitation(
    email: str = "invite@test.com",
    role: str = "tenant_admin",
    tenant_id: Optional[uuid.UUID] = None,
    hours_until_expiry: float = 72,
    is_used: bool = False,
) -> Invitation:
    inv = Invitation.__new__(Invitation)
    inv.id = uuid.uuid4()
    inv.email = email
    inv.name = "Invited User"
    inv.token = "test-token-" + uuid.uuid4().hex
    inv.role = role
    inv.tenant_id = tenant_id or uuid.uuid4()
    inv.tenant_name = "Test Tenant"
    inv.is_used = is_used
    inv.expires_at = datetime.now(timezone.utc) + timedelta(hours=hours_until_expiry)
    inv.accepted_at = None
    inv.invited_by_id = None
    return inv
