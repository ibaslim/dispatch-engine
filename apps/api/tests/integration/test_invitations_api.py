"""Tests for POST /api/v1/invitations/accept (public invitation acceptance).

Damage if these break:
  token validity -> an expired or already-used invitation still provisions an account
  single use     -> one invite link creates multiple accounts / re-provisions
  provisioning   -> accepting does not create the user + pending onboarding application
  input guards   -> a too-short password or missing username is accepted

The endpoint is public (no auth): it is how an invited user first gets a credential.
"""
import pytest
from sqlalchemy import select

from app.models.invitation import Invitation
from app.models.onboarding_application import ApplicationStatus, OnboardingApplication
from app.models.user import User
from tests.factories import (
    InvitationFactory,
    OnboardingApplicationFactory,
    UserFactory,
)
from tests.utils import API

pytestmark = pytest.mark.integration

ACCEPT = f"{API}/invitations/accept"
PASSWORD = "correct-horse-8"


class TestAcceptInvitation:
    async def test_accepts_a_valid_invitation(self, db, client, tenant):
        invitation = await InvitationFactory.create(
            db, tenant=tenant, email="newhire@example.test", role="vendor"
        )

        response = await client.post(
            ACCEPT,
            json={"token": invitation.token, "password": PASSWORD, "username": "newhire"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "pre_pending"
        assert body["access_token"]

        # The account is provisioned but inactive, with a pending onboarding application.
        user = await db.scalar(select(User).where(User.email == "newhire@example.test"))
        assert user is not None
        assert user.is_active is False
        app = await db.scalar(
            select(OnboardingApplication).where(OnboardingApplication.user_id == user.id)
        )
        assert app is not None
        assert app.status == ApplicationStatus.pre_pending
        # And the invitation is now single-use spent.
        await db.refresh(invitation)
        assert invitation.is_used is True

    async def test_rejects_a_short_password(self, db, client, tenant):
        invitation = await InvitationFactory.create(db, tenant=tenant)

        response = await client.post(
            ACCEPT, json={"token": invitation.token, "password": "short12", "username": "x"}
        )

        assert response.status_code == 422

    async def test_requires_a_username(self, db, client, tenant):
        invitation = await InvitationFactory.create(db, tenant=tenant)

        response = await client.post(
            ACCEPT, json={"token": invitation.token, "password": PASSWORD}
        )

        assert response.status_code == 422

    async def test_rejects_an_unknown_token(self, client):
        response = await client.post(
            ACCEPT, json={"token": "no-such-token", "password": PASSWORD, "username": "x"}
        )

        assert response.status_code == 400

    async def test_rejects_an_expired_invitation(self, db, client, tenant):
        invitation = await InvitationFactory.create(
            db, tenant=tenant, hours_until_expiry=-1
        )

        response = await client.post(
            ACCEPT, json={"token": invitation.token, "password": PASSWORD, "username": "x"}
        )

        assert response.status_code == 400

    async def test_rejects_a_used_invitation_without_an_existing_account(
        self, db, client, tenant
    ):
        """A spent invitation whose user was never created cannot re-provision."""
        invitation = await InvitationFactory.create(
            db, tenant=tenant, email="ghost@example.test", is_used=True
        )

        response = await client.post(
            ACCEPT, json={"token": invitation.token, "password": PASSWORD, "username": "x"}
        )

        assert response.status_code == 400

    async def test_used_invitation_routes_an_existing_pending_user_to_onboarding(
        self, db, client, tenant
    ):
        """Re-using a spent invite for an already-provisioned, still-pending user does not
        create a new account -- it returns their pending-onboarding status."""
        invitation = await InvitationFactory.create(
            db, tenant=tenant, email="rejoin@example.test", is_used=True, role="vendor"
        )
        user = await UserFactory.create(
            db, tenant=tenant, email="rejoin@example.test", is_active=False
        )
        await OnboardingApplicationFactory.create(
            db, user=user, status=ApplicationStatus.pre_pending, role="vendor"
        )

        response = await client.post(
            ACCEPT, json={"token": invitation.token, "password": PASSWORD, "username": "rejoin"}
        )

        assert response.status_code == 200
        assert response.json()["status"] == "pre_pending"
