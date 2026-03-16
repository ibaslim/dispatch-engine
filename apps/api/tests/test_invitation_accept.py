"""
Unit tests for invitation token validation logic.
Tests single-use and expiry behavior.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.invitation import Invitation
from tests.conftest import make_invitation


class TestInvitationIsValid:
    def test_valid_invitation_is_valid(self):
        """A fresh, unused invitation is valid."""
        inv = make_invitation(hours_until_expiry=72)
        assert inv.is_valid() is True

    def test_expired_invitation_is_invalid(self):
        """An invitation past its expiry is not valid."""
        inv = make_invitation(hours_until_expiry=-1)
        assert inv.is_valid() is False

    def test_used_invitation_is_invalid(self):
        """An already-used invitation cannot be accepted again (single-use)."""
        inv = make_invitation(is_used=True)
        assert inv.is_valid() is False

    def test_invitation_expiring_soon_is_still_valid(self):
        """An invitation expiring in 1 minute is still valid."""
        inv = make_invitation(hours_until_expiry=1 / 60)
        assert inv.is_valid() is True

    def test_invitation_expired_by_one_second_is_invalid(self):
        """An invitation expired by 1 second is not valid."""
        inv = make_invitation()
        inv.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        assert inv.is_valid() is False

    def test_used_and_expired_invitation_is_invalid(self):
        """Invitation that is both used and expired is not valid."""
        inv = make_invitation(is_used=True, hours_until_expiry=-10)
        assert inv.is_valid() is False

    def test_different_tenants_each_get_own_invitation(self):
        """Two invitations for different tenants do not share state."""
        tenant_a = uuid.uuid4()
        tenant_b = uuid.uuid4()
        inv_a = make_invitation(email="a@a.com", tenant_id=tenant_a)
        inv_b = make_invitation(email="b@b.com", tenant_id=tenant_b)

        # Simulate accepting inv_a
        inv_a.is_used = True

        assert inv_a.is_valid() is False
        assert inv_b.is_valid() is True
