"""Tests for /api/v1/onboarding/applications.

Damage if these break:
  submit          -> an applicant's submission is lost, or duplicates pile up
  list / get      -> one tenant reads another tenant's applicant details
  approve         -> an applicant stays locked out, or is onboarded by a stranger
  reject          -> a decision is recorded without its reason
"""
import pytest
from sqlalchemy import func, select

from app.models.onboarding_application import ApplicationStatus, OnboardingApplication
from app.models.tenant import Tenant
from app.models.user import RoleEnum, UserRole
from tests.factories import OnboardingApplicationFactory, UserFactory
from tests.utils import API

pytestmark = pytest.mark.integration

APPLICATIONS = f"{API}/onboarding/applications"

VENDOR_FORM = {
    "fullName": "Jane Doe",
    "email": "jane@example.test",
    "phone": {"countryCode": "+1", "number": "5551234"},
    "address": "1 Main St",
    "businessNumber": "BN-123",
}


@pytest.fixture
async def applicant(db):
    """A signed-up user who has no tenant yet. Inactive until approved."""
    return await UserFactory.create(db, tenant=None, is_active=False, name="Jane Doe")


@pytest.fixture
async def tenant_applicant(db, tenant):
    """An applicant already attached to `tenant`, so its admin can review them."""
    return await UserFactory.create(db, tenant=tenant, is_active=False, name="Inside Applicant")


class TestSubmitApplication:
    async def test_creates_a_pending_application(self, db, authenticate, applicant):
        response = await authenticate(applicant).post(
            APPLICATIONS, json={"role": "vendor", "data": VENDOR_FORM}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "pending"
        assert body["role"] == "vendor"
        assert body["data"]["businessNumber"] == "BN-123"

        stored = await db.scalar(
            select(OnboardingApplication).where(
                OnboardingApplication.user_id == applicant.id
            )
        )
        assert stored is not None
        assert stored.status is ApplicationStatus.pending

    async def test_resubmitting_while_pending_updates_the_same_application(
        self, db, authenticate, applicant
    ):
        client = authenticate(applicant)
        first = await client.post(APPLICATIONS, json={"role": "vendor", "data": VENDOR_FORM})

        second = await client.post(
            APPLICATIONS,
            json={"role": "vendor", "data": {**VENDOR_FORM, "address": "2 Second St"}},
        )

        assert second.json()["id"] == first.json()["id"]
        assert second.json()["data"]["address"] == "2 Second St"

        count = await db.scalar(
            select(func.count())
            .select_from(OnboardingApplication)
            .where(OnboardingApplication.user_id == applicant.id)
        )
        assert count == 1

    async def test_merges_new_data_into_the_existing_submission(
        self, authenticate, applicant
    ):
        client = authenticate(applicant)
        await client.post(APPLICATIONS, json={"role": "vendor", "data": VENDOR_FORM})

        response = await client.post(
            APPLICATIONS, json={"role": "vendor", "data": {"notes": "Called ahead"}}
        )

        body = response.json()["data"]
        assert body["notes"] == "Called ahead"
        assert body["fullName"] == "Jane Doe"

    async def test_rejects_an_unknown_role(self, authenticate, applicant):
        response = await authenticate(applicant).post(
            APPLICATIONS, json={"role": "wizard", "data": {}}
        )

        assert response.status_code == 400

    async def test_requires_authentication(self, client):
        response = await client.post(APPLICATIONS, json={"role": "vendor", "data": {}})

        assert response.status_code == 401

    async def test_queues_the_confirmation_email(
        self, authenticate, applicant, queued_tasks
    ):
        await authenticate(applicant).post(
            APPLICATIONS, json={"role": "vendor", "data": VENDOR_FORM}
        )

        queued = [name for name, _ in queued_tasks]
        assert "send_onboarding_submitted_email" in queued


class TestMyApplication:
    async def test_returns_null_when_the_user_never_applied(self, authenticate, applicant):
        response = await authenticate(applicant).get(f"{APPLICATIONS}/me")

        assert response.status_code == 200
        assert response.json() is None

    async def test_returns_the_users_own_application(
        self, db, authenticate, applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=applicant)

        response = await authenticate(applicant).get(f"{APPLICATIONS}/me")

        assert response.json()["id"] == str(application.id)


class TestListApplications:
    async def test_hides_applicants_from_another_tenant(
        self, db, tenant_admin_client, tenant_applicant, other_tenant
    ):
        mine = await OnboardingApplicationFactory.create(db, user=tenant_applicant)
        stranger = await UserFactory.create(db, tenant=other_tenant, is_active=False)
        await OnboardingApplicationFactory.create(db, user=stranger)

        response = await tenant_admin_client.get(APPLICATIONS)

        assert response.status_code == 200
        assert [a["id"] for a in response.json()] == [str(mine.id)]

    async def test_platform_admin_sees_every_tenants_applications(
        self, db, platform_admin_client, tenant_applicant, other_tenant
    ):
        await OnboardingApplicationFactory.create(db, user=tenant_applicant)
        stranger = await UserFactory.create(db, tenant=other_tenant, is_active=False)
        await OnboardingApplicationFactory.create(db, user=stranger)

        response = await platform_admin_client.get(APPLICATIONS)

        assert len(response.json()) == 2

    async def test_filters_by_status(self, db, tenant_admin_client, tenant, tenant_applicant):
        await OnboardingApplicationFactory.create(db, user=tenant_applicant)
        approved_user = await UserFactory.create(db, tenant=tenant, is_active=False)
        approved = await OnboardingApplicationFactory.create(
            db, user=approved_user, status=ApplicationStatus.approved
        )

        response = await tenant_admin_client.get(APPLICATIONS, params={"status_filter": "approved"})

        assert [a["id"] for a in response.json()] == [str(approved.id)]

    async def test_rejects_an_unknown_status_filter(self, tenant_admin_client):
        response = await tenant_admin_client.get(APPLICATIONS, params={"status_filter": "banana"})

        assert response.status_code == 400

    async def test_rejects_a_dispatcher(self, dispatcher_client):
        response = await dispatcher_client.get(APPLICATIONS)

        assert response.status_code == 403


class TestGetApplication:
    async def test_returns_an_application_in_my_tenant(
        self, db, tenant_admin_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        response = await tenant_admin_client.get(f"{APPLICATIONS}/{application.id}")

        assert response.status_code == 200
        assert response.json()["id"] == str(application.id)

    async def test_hides_an_application_from_another_tenant(
        self, db, other_tenant_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        response = await other_tenant_client.get(f"{APPLICATIONS}/{application.id}")

        assert response.status_code == 404


class TestApproveApplication:
    async def test_marks_the_application_approved_and_records_the_reviewer(
        self, db, tenant_admin_client, tenant_admin, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        response = await tenant_admin_client.post(f"{APPLICATIONS}/{application.id}/approve")

        assert response.status_code == 200
        assert response.json()["status"] == "approved"
        assert response.json()["reviewed_by_id"] == str(tenant_admin.id)
        assert response.json()["reviewed_at"] is not None

    async def test_activates_the_applicant_and_grants_the_role(
        self, db, tenant_admin_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(
            db, user=tenant_applicant, role=RoleEnum.vendor.value
        )

        await tenant_admin_client.post(f"{APPLICATIONS}/{application.id}/approve")

        await db.refresh(tenant_applicant)
        assert tenant_applicant.is_active is True

        granted = await db.scalar(
            select(UserRole.role).where(UserRole.user_id == tenant_applicant.id)
        )
        assert granted is RoleEnum.vendor

    async def test_creates_a_tenant_for_an_applicant_who_has_none(
        self, db, platform_admin_client, applicant
    ):
        application = await OnboardingApplicationFactory.create(
            db, user=applicant, role=RoleEnum.vendor.value, data=VENDOR_FORM
        )

        response = await platform_admin_client.post(f"{APPLICATIONS}/{application.id}/approve")

        assert response.status_code == 200
        await db.refresh(applicant)
        assert applicant.tenant_id is not None

        created = await db.scalar(select(Tenant).where(Tenant.id == applicant.tenant_id))
        assert created.name == "Jane Doe"
        assert created.slug == "jane-doe"
        assert created.ntn_number == "BN-123"

    async def test_rejects_approval_from_another_tenant(
        self, db, other_tenant_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        response = await other_tenant_client.post(f"{APPLICATIONS}/{application.id}/approve")

        assert response.status_code == 403
        await db.refresh(application)
        assert application.status is ApplicationStatus.pending

    async def test_returns_404_for_an_unknown_application(self, tenant_admin_client):
        import uuid

        response = await tenant_admin_client.post(f"{APPLICATIONS}/{uuid.uuid4()}/approve")

        assert response.status_code == 404


class TestRejectApplication:
    async def test_records_the_rejection_reason(
        self, db, tenant_admin_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        response = await tenant_admin_client.post(
            f"{APPLICATIONS}/{application.id}/reject",
            json={"reason": "Business number could not be verified"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "rejected"
        assert response.json()["decision_reason"] == "Business number could not be verified"

    async def test_leaves_the_applicant_inactive(
        self, db, tenant_admin_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        await tenant_admin_client.post(
            f"{APPLICATIONS}/{application.id}/reject", json={"reason": "No"}
        )

        await db.refresh(tenant_applicant)
        assert tenant_applicant.is_active is False

    async def test_rejects_a_rejection_from_another_tenant(
        self, db, other_tenant_client, tenant_applicant
    ):
        application = await OnboardingApplicationFactory.create(db, user=tenant_applicant)

        response = await other_tenant_client.post(
            f"{APPLICATIONS}/{application.id}/reject", json={"reason": "Nope"}
        )

        assert response.status_code == 403
        await db.refresh(application)
        assert application.status is ApplicationStatus.pending
