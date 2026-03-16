"""
Test configuration and fixtures.

Unit tests use plain Python dataclasses to represent model state, avoiding
any dependency on a live database or SQLAlchemy session setup.  The
pure-Python business-logic methods (is_valid, has_role, etc.) are exercised
by delegating to standalone helpers that mirror exactly what the ORM methods do.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import pytest


# ---------------------------------------------------------------------------
# Lightweight dataclass stand-ins for ORM models.
# These carry the same attributes and method signatures used in tests, but
# have no SQLAlchemy instrumentation and need no DB connection.
# ---------------------------------------------------------------------------

@dataclass
class _InvitationStub:
    email: str
    token: str
    role: str
    tenant_id: uuid.UUID
    expires_at: datetime
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    name: Optional[str] = None
    tenant_name: Optional[str] = None
    is_used: bool = False
    accepted_at: Optional[datetime] = None
    invited_by_id: Optional[uuid.UUID] = None

    def is_valid(self) -> bool:
        """Return True if invitation can still be accepted."""
        now = datetime.now(timezone.utc)
        return not self.is_used and self.expires_at > now


@dataclass
class _UserRoleStub:
    user_id: uuid.UUID
    role: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)


@dataclass
class _UserStoreAccessStub:
    user_id: uuid.UUID
    store_id: uuid.UUID
    id: uuid.UUID = field(default_factory=uuid.uuid4)


@dataclass
class _UserStub:
    email: str
    name: str
    tenant_id: Optional[uuid.UUID] = None
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    hashed_password: Optional[str] = None
    is_active: bool = True
    is_platform_admin: bool = False
    roles: List[_UserRoleStub] = field(default_factory=list)
    store_accesses: List[_UserStoreAccessStub] = field(default_factory=list)

    def has_role(self, role: str) -> bool:
        return any(r.role == role for r in self.roles)

    def get_accessible_store_ids(self) -> List[uuid.UUID]:
        return [sa.store_id for sa in self.store_accesses]


@dataclass
class _TenantStub:
    name: str
    slug: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    is_active: bool = True


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_tenant() -> _TenantStub:
    return _TenantStub(name="Test Tenant", slug="test-tenant")


@pytest.fixture
def sample_user(sample_tenant: _TenantStub) -> _UserStub:
    return _UserStub(
        email="user@test.com",
        name="Test User",
        hashed_password="$2b$12$placeholder",
        tenant_id=sample_tenant.id,
    )


@pytest.fixture
def platform_admin_user() -> _UserStub:
    return _UserStub(
        email="admin@platform.com",
        name="Platform Admin",
        hashed_password="$2b$12$placeholder",
        is_platform_admin=True,
    )


def make_invitation(
    email: str = "invite@test.com",
    role: str = "tenant_admin",
    tenant_id: Optional[uuid.UUID] = None,
    hours_until_expiry: float = 72,
    is_used: bool = False,
) -> _InvitationStub:
    return _InvitationStub(
        email=email,
        name="Invited User",
        token="test-token-" + uuid.uuid4().hex,
        role=role,
        tenant_id=tenant_id or uuid.uuid4(),
        tenant_name="Test Tenant",
        is_used=is_used,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=hours_until_expiry),
    )
