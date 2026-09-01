"""Tests for /api/v1/orders.

Damage if these break:
  listing       -> a vendor reads another vendor's orders, or a driver sees jobs
                   that are not theirs
  driver view   -> platform finances (subtotal, totals, payment details) leak to
                   the driver app
  write access  -> a tenant user mutates orders they should only be able to read
  activity      -> the delivery checkpoint trail is wrong, or a stranger advances
                   someone else's delivery
  publish/accept-> two drivers accept the same job, or an expired broadcast is
                   still claimable

Not covered here: the create_order happy path (needs the Google Maps quote and a
seeded pricing fixture) and POST /orders/quote.
"""
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.api.routers.orders import APP_TIMEZONE, PUBLISH_WINDOW_MINUTES
from app.models.order import ActivityStatus, Order, OrderStatus
from app.models.tenant import TenantRole
from app.models.user import RoleEnum
from tests.factories import OrderFactory, TenantFactory, UserFactory
from tests.utils import API

pytestmark = pytest.mark.integration

ORDERS = f"{API}/orders"


@pytest.fixture
async def vendor_client(authenticate, tenant_admin):
    """A vendor-tenant user. Read-only over orders."""
    return authenticate(tenant_admin)


@pytest.fixture
async def assigned_order(db, tenant, driver_tenant):
    """An order belonging to `tenant` and assigned to `driver_tenant`."""
    return await OrderFactory.create(db, vendor=tenant, driver=driver_tenant)


def published_at(minutes_ago: float) -> datetime:
    return datetime.now(APP_TIMEZONE) - timedelta(minutes=minutes_ago)


class TestListOrders:
    async def test_vendor_sees_its_own_orders(self, vendor_client, order):
        response = await vendor_client.get(ORDERS)

        assert response.status_code == 200
        assert [o["id"] for o in response.json()] == [str(order.id)]

    async def test_vendor_does_not_see_another_vendors_orders(
        self, db, vendor_client, order, other_tenant
    ):
        await OrderFactory.create(db, vendor=other_tenant)

        response = await vendor_client.get(ORDERS)

        assert [o["id"] for o in response.json()] == [str(order.id)]

    async def test_driver_sees_only_orders_assigned_to_them(
        self, db, driver_client, assigned_order, tenant
    ):
        await OrderFactory.create(db, vendor=tenant)

        response = await driver_client.get(ORDERS)

        assert [o["id"] for o in response.json()] == [str(assigned_order.id)]

    async def test_driver_response_hides_platform_finances(
        self, driver_client, assigned_order
    ):
        """The driver app must never receive customer pricing."""
        response = await driver_client.get(ORDERS)

        body = response.json()[0]
        assert body["subtotal"] == 0
        assert body["total"] == 0
        assert body["tax_amount"] == 0
        assert body["payment_details"] is None

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY: get_orders widens the vendor filter with "
        "`Order.pickup_name == tenant.name`. pickup_name is free text on someone "
        "else's order, so any tenant that sets it to a rival's name exposes that "
        "order. Remove this marker once the fallback is dropped.",
    )
    async def test_does_not_leak_an_order_whose_pickup_name_matches_my_tenant(
        self, db, vendor_client, tenant, other_tenant, order
    ):
        """pickup_name is free text a rival controls; it must not grant visibility."""
        await OrderFactory.create(db, vendor=other_tenant, pickup_name=tenant.name)

        response = await vendor_client.get(ORDERS)

        assert [o["id"] for o in response.json()] == [str(order.id)]

    async def test_platform_admin_sees_every_tenants_orders(
        self, db, platform_admin_client, order, other_tenant
    ):
        await OrderFactory.create(db, vendor=other_tenant)

        response = await platform_admin_client.get(ORDERS)

        assert len(response.json()) == 2

    async def test_requires_authentication(self, client):
        response = await client.get(ORDERS)

        assert response.status_code == 401


class TestDeleteOrder:
    async def test_platform_admin_deletes_the_order(self, db, platform_admin_client, order):
        response = await platform_admin_client.delete(f"{ORDERS}/{order.id}")

        assert response.status_code == 200
        assert await db.scalar(select(Order).where(Order.id == order.id)) is None

    async def test_rejects_a_tenant_user(self, db, vendor_client, order):
        response = await vendor_client.delete(f"{ORDERS}/{order.id}")

        assert response.status_code == 403
        assert await db.scalar(select(Order).where(Order.id == order.id)) is not None

    async def test_returns_404_for_an_unknown_order(self, platform_admin_client):
        response = await platform_admin_client.delete(f"{ORDERS}/{uuid.uuid4()}")

        assert response.status_code == 404


class TestUpdateStatus:
    async def test_owner_can_change_the_status(self, db, vendor_client, order):
        response = await vendor_client.patch(
            f"{ORDERS}/{order.id}/status", json={"status": "completed"}
        )

        assert response.status_code == 200
        await db.refresh(order)
        assert order.status is OrderStatus.completed

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY: the update_status guard ANDs the driver clause with the "
        "vendor clause. A vendor tenant fails the driver clause and a driver tenant "
        "fails the vendor clause, so the condition can never be true and no tenant "
        "is ever refused. Should be OR. Remove this marker once fixed.",
    )
    async def test_rejects_a_vendor_from_another_tenant(
        self, db, other_tenant_client, order
    ):
        response = await other_tenant_client.patch(
            f"{ORDERS}/{order.id}/status", json={"status": "completed"}
        )

        assert response.status_code == 403
        await db.refresh(order)
        assert order.status is OrderStatus.current

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY: the update_status guard ANDs the driver clause with the "
        "vendor clause. A vendor tenant fails the driver clause and a driver tenant "
        "fails the vendor clause, so the condition can never be true and no tenant "
        "is ever refused. Should be OR. Remove this marker once fixed.",
    )
    async def test_rejects_a_driver_the_order_is_not_assigned_to(
        self, db, driver_client, order
    ):
        response = await driver_client.patch(
            f"{ORDERS}/{order.id}/status", json={"status": "completed"}
        )

        assert response.status_code == 403
        await db.refresh(order)
        assert order.status is OrderStatus.current

    async def test_returns_404_for_an_unknown_order(self, vendor_client):
        response = await vendor_client.patch(
            f"{ORDERS}/{uuid.uuid4()}/status", json={"status": "completed"}
        )

        assert response.status_code == 404


class TestUpdateActivityStatus:
    async def test_assigned_driver_advances_the_delivery(
        self, db, driver_client, assigned_order
    ):
        response = await driver_client.patch(
            f"{ORDERS}/{assigned_order.id}/activity-status",
            json={"activity_status": "delivery_in_progress"},
        )

        assert response.status_code == 200
        await db.refresh(assigned_order)
        assert assigned_order.activity_status is ActivityStatus.delivery_in_progress
        assert assigned_order.delivery_in_progress_at is not None

    async def test_marking_delivered_completes_the_order(
        self, db, driver_client, assigned_order
    ):
        response = await driver_client.patch(
            f"{ORDERS}/{assigned_order.id}/activity-status",
            json={"activity_status": "delivered"},
        )

        assert response.status_code == 200
        await db.refresh(assigned_order)
        assert assigned_order.activity_status is ActivityStatus.delivered
        assert assigned_order.status is OrderStatus.completed
        assert assigned_order.delivered_at is not None

    async def test_rejects_a_driver_the_order_is_not_assigned_to(
        self, db, authenticate, order, other_tenant
    ):
        stranger = await UserFactory.create(db, tenant=other_tenant)

        response = await authenticate(stranger).patch(
            f"{ORDERS}/{order.id}/activity-status",
            json={"activity_status": "delivered"},
        )

        assert response.status_code == 403
        await db.refresh(order)
        assert order.activity_status is ActivityStatus.driver_not_assigned

    async def test_rejects_the_vendor_that_owns_the_order(
        self, db, vendor_client, assigned_order
    ):
        """Only the assigned driver advances a delivery, not the vendor."""
        response = await vendor_client.patch(
            f"{ORDERS}/{assigned_order.id}/activity-status",
            json={"activity_status": "delivered"},
        )

        assert response.status_code == 403

    async def test_returns_404_for_an_unknown_order(self, driver_client):
        response = await driver_client.patch(
            f"{ORDERS}/{uuid.uuid4()}/activity-status",
            json={"activity_status": "delivered"},
        )

        assert response.status_code == 404


class TestAssignDriver:
    async def test_assigns_the_driver_and_starts_the_pickup(
        self, db, platform_admin_client, order, driver_tenant
    ):
        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}/assign-driver", json={"driver_id": str(driver_tenant.id)}
        )

        assert response.status_code == 200
        await db.refresh(order)
        assert order.driver_id == driver_tenant.id
        assert order.activity_status is ActivityStatus.pickup_initiated
        assert order.pickup_initiated_at is not None

    async def test_assignment_removes_the_order_from_the_broadcast(
        self, db, platform_admin_client, tenant, driver_tenant
    ):
        order = await OrderFactory.create(
            db, vendor=tenant, published=True, published_at=published_at(1)
        )

        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}/assign-driver", json={"driver_id": str(driver_tenant.id)}
        )

        await db.refresh(order)
        assert order.published is False

    async def test_rejects_a_tenant_user(self, vendor_client, order, driver_tenant):
        response = await vendor_client.patch(
            f"{ORDERS}/{order.id}/assign-driver", json={"driver_id": str(driver_tenant.id)}
        )

        assert response.status_code == 403

    async def test_rejects_a_tenant_that_is_not_a_driver(
        self, platform_admin_client, order, other_tenant
    ):
        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}/assign-driver", json={"driver_id": str(other_tenant.id)}
        )

        assert response.status_code == 404

    async def test_rejects_an_inactive_driver(
        self, db, platform_admin_client, order, driver_tenant
    ):
        driver_tenant.is_active = False
        await db.flush()

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}/assign-driver", json={"driver_id": str(driver_tenant.id)}
        )

        assert response.status_code == 404


class TestPublishOrder:
    async def test_platform_admin_publishes_the_order(
        self, db, platform_admin_client, order
    ):
        response = await platform_admin_client.post(f"{ORDERS}/{order.id}/publish")

        assert response.status_code == 200
        await db.refresh(order)
        assert order.published is True
        assert order.published_at is not None

    async def test_rejects_a_tenant_user(self, db, vendor_client, order):
        response = await vendor_client.post(f"{ORDERS}/{order.id}/publish")

        assert response.status_code == 403
        await db.refresh(order)
        assert order.published is False


class TestPublishedOrders:
    async def test_driver_sees_a_freshly_published_unassigned_order(
        self, db, driver_client, tenant
    ):
        order = await OrderFactory.create(
            db, vendor=tenant, published=True, published_at=published_at(1)
        )

        response = await driver_client.get(f"{ORDERS}/published")

        assert response.status_code == 200
        assert [o["id"] for o in response.json()] == [str(order.id)]

    async def test_excludes_a_broadcast_that_has_expired(
        self, db, driver_client, tenant
    ):
        await OrderFactory.create(
            db,
            vendor=tenant,
            published=True,
            published_at=published_at(PUBLISH_WINDOW_MINUTES + 1),
        )

        response = await driver_client.get(f"{ORDERS}/published")

        assert response.json() == []

    async def test_excludes_an_order_another_driver_already_took(
        self, db, driver_client, tenant, driver_tenant
    ):
        await OrderFactory.create(
            db,
            vendor=tenant,
            driver=driver_tenant,
            published=True,
            published_at=published_at(1),
        )

        response = await driver_client.get(f"{ORDERS}/published")

        assert response.json() == []

    async def test_rejects_a_vendor(self, vendor_client):
        response = await vendor_client.get(f"{ORDERS}/published")

        assert response.status_code == 403


class TestAcceptOrder:
    async def test_driver_claims_a_published_order(
        self, db, driver_client, driver_tenant, tenant
    ):
        order = await OrderFactory.create(
            db, vendor=tenant, published=True, published_at=published_at(1)
        )

        response = await driver_client.post(f"{ORDERS}/{order.id}/accept")

        assert response.status_code == 200
        await db.refresh(order)
        assert order.driver_id == driver_tenant.id
        assert order.published is False
        assert order.activity_status is ActivityStatus.pickup_initiated

    async def test_rejects_an_order_already_taken_by_another_driver(
        self, db, driver_client, tenant, other_tenant
    ):
        order = await OrderFactory.create(
            db,
            vendor=tenant,
            driver=other_tenant,
            published=True,
            published_at=published_at(1),
        )

        response = await driver_client.post(f"{ORDERS}/{order.id}/accept")

        assert response.status_code == 409

    async def test_rejects_an_order_that_was_never_published(
        self, db, driver_client, order
    ):
        response = await driver_client.post(f"{ORDERS}/{order.id}/accept")

        assert response.status_code == 400
        await db.refresh(order)
        assert order.driver_id is None

    async def test_rejects_an_expired_broadcast(self, db, driver_client, tenant):
        order = await OrderFactory.create(
            db,
            vendor=tenant,
            published=True,
            published_at=published_at(PUBLISH_WINDOW_MINUTES + 1),
        )

        response = await driver_client.post(f"{ORDERS}/{order.id}/accept")

        assert response.status_code == 410
        await db.refresh(order)
        assert order.driver_id is None

    async def test_rejects_a_vendor(self, db, vendor_client, tenant):
        order = await OrderFactory.create(
            db, vendor=tenant, published=True, published_at=published_at(1)
        )

        response = await vendor_client.post(f"{ORDERS}/{order.id}/accept")

        assert response.status_code == 403

    async def test_returns_404_for_an_unknown_order(self, driver_client):
        response = await driver_client.post(f"{ORDERS}/{uuid.uuid4()}/accept")

        assert response.status_code == 404


class TestToggleReady:
    async def test_platform_admin_marks_the_order_ready(
        self, db, platform_admin_client, order
    ):
        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}/ready", json={"ready": True}
        )

        assert response.status_code == 200
        assert response.json()["ready_for_pickup"] is True
        await db.refresh(order)
        assert order.ready_for_pickup is True

    async def test_rejects_a_tenant_user(self, db, vendor_client, order):
        response = await vendor_client.patch(
            f"{ORDERS}/{order.id}/ready", json={"ready": True}
        )

        assert response.status_code == 403
        await db.refresh(order)
        assert order.ready_for_pickup is False


def _valid_order_payload(**overrides) -> dict:
    """A fully-valid OrderCreate body. Required so request validation passes and the
    endpoint's own auth/RBAC branch is what decides the status (an invalid body would
    short-circuit to 422 before the guard runs)."""
    payload = {
        "pickup_name": "Pickup Contact",
        "pickup_phone": "+15550000001",
        "pickup_email": "pickup@example.test",
        "pickup_address": "1 Test Street, Toronto, ON",
        "pickup_date": "2026-08-27",
        "pickup_time": "10:00",
        "delivery_name": "Delivery Contact",
        "delivery_phone": "+15550000002",
        "delivery_email": "delivery@example.test",
        "delivery_address": "2 Test Avenue, Toronto, ON",
        "delivery_date": "2026-08-27",
        "delivery_time": "12:00",
        "items": [{"itemName": "Widget", "itemPrice": 10.0, "itemQty": 1}],
        "subtotal": 10.0,
        "tax_rate": 0.13,
        "tax_amount": 1.3,
        "delivery_fees": 5.0,
        "delivery_tips": 0.0,
        "discount": 0.0,
        "total": 16.3,
        "payment_method": "cash",
    }
    payload.update(overrides)
    return payload


class TestCreateOrder:
    """POST /orders is platform-admin only: tenant users are read-only.

    The happy path (a platform admin creating an order) is not covered here -- it
    runs the Google Maps delivery quote and the full pricing pipeline, which needs a
    seeded operational-zone/pricing fixture. That is tracked separately; mocking our
    own quote service would violate the suite's mocking boundary (CLAUDE.md section 6).
    """

    async def test_requires_authentication(self, client):
        response = await client.post(ORDERS, json=_valid_order_payload())

        assert response.status_code == 401

    async def test_rejects_a_vendor_tenant_user(self, db, vendor_client):
        response = await vendor_client.post(ORDERS, json=_valid_order_payload())

        assert response.status_code == 403
        assert "read-only" in response.json()["detail"].lower()
        # Nothing was written.
        assert await db.scalar(select(Order)) is None

    async def test_rejects_a_driver_tenant_user(self, driver_client):
        response = await driver_client.post(ORDERS, json=_valid_order_payload())

        assert response.status_code == 403


class TestUpdateOrder:
    """PATCH /orders/{id} is platform-admin only."""

    async def test_platform_admin_edits_a_field(self, db, platform_admin_client, order):
        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_name": "Updated Recipient"}
        )

        assert response.status_code == 200
        assert response.json()["delivery_name"] == "Updated Recipient"
        await db.refresh(order)
        assert order.delivery_name == "Updated Recipient"

    async def test_rejects_a_tenant_user(self, db, vendor_client, order):
        response = await vendor_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_name": "Should Not Apply"}
        )

        assert response.status_code == 403
        await db.refresh(order)
        assert order.delivery_name == "Delivery Contact"

    async def test_returns_404_for_an_unknown_order(self, platform_admin_client):
        response = await platform_admin_client.patch(
            f"{ORDERS}/{uuid.uuid4()}", json={"delivery_name": "Nobody"}
        )

        assert response.status_code == 404


class TestReportIncident:
    """POST /orders/{id}/report -- only the assigned driver may report an issue."""

    async def test_assigned_driver_reports_an_incident(self, db, driver_client, assigned_order):
        response = await driver_client.post(
            f"{ORDERS}/{assigned_order.id}/report",
            json={"stage": "pickup", "reason": "no_answer"},
        )

        assert response.status_code == 200
        assert response.json()["incident_report"]["reason"] == "no_answer"
        await db.refresh(assigned_order)
        assert assigned_order.incident_report["reason"] == "no_answer"
        assert assigned_order.incident_report["stage"] == "pickup"

    async def test_rejects_a_driver_the_order_is_not_assigned_to(self, db, authenticate, assigned_order):
        # A driver tenant that is not the one the order is assigned to.
        stranger_tenant = await TenantFactory.create(
            db, name="Other Driver", role=TenantRole.driver
        )
        stranger = await UserFactory.create(
            db, tenant=stranger_tenant, roles=(RoleEnum.driver,)
        )

        response = await authenticate(stranger).post(
            f"{ORDERS}/{assigned_order.id}/report",
            json={"stage": "pickup", "reason": "no_answer"},
        )

        assert response.status_code == 403
        await db.refresh(assigned_order)
        assert assigned_order.incident_report is None

    async def test_rejects_the_vendor_that_owns_the_order(self, vendor_client, assigned_order):
        response = await vendor_client.post(
            f"{ORDERS}/{assigned_order.id}/report",
            json={"stage": "pickup", "reason": "no_answer"},
        )

        assert response.status_code == 403

    async def test_returns_404_for_an_unknown_order(self, driver_client):
        response = await driver_client.post(
            f"{ORDERS}/{uuid.uuid4()}/report",
            json={"stage": "pickup", "reason": "no_answer"},
        )

        assert response.status_code == 404

    async def test_rejects_a_second_incident_on_the_same_order(self, db, driver_client, tenant, driver_tenant):
        order = await OrderFactory.create(
            db, vendor=tenant, driver=driver_tenant,
            incident_report={"id": "existing", "stage": "pickup", "reason": "no_answer"},
        )

        response = await driver_client.post(
            f"{ORDERS}/{order.id}/report",
            json={"stage": "pickup", "reason": "wrong_address"},
        )

        assert response.status_code == 400

    async def test_rejects_a_reason_not_valid_for_the_stage(self, driver_client, assigned_order):
        # business_closed is a pickup-only reason; not allowed at the delivery stage.
        response = await driver_client.post(
            f"{ORDERS}/{assigned_order.id}/report",
            json={"stage": "delivery", "reason": "business_closed"},
        )

        assert response.status_code == 400


class TestSendSenderInvoice:
    """POST /orders/{id}/notify/sender -- platform admin only, emails the pickup contact."""

    async def test_platform_admin_queues_the_invoice_email(self, platform_admin_client, order, queued_tasks):
        response = await platform_admin_client.post(f"{ORDERS}/{order.id}/notify/sender")

        assert response.status_code == 200
        assert response.json()["email"] == "pickup@example.test"
        queued = [name for name, _ in queued_tasks]
        assert "send_order_sender_invoice_email" in queued

    async def test_rejects_a_tenant_user(self, vendor_client, order, queued_tasks):
        response = await vendor_client.post(f"{ORDERS}/{order.id}/notify/sender")

        assert response.status_code == 403
        assert queued_tasks == []

    async def test_returns_404_for_an_unknown_order(self, platform_admin_client):
        response = await platform_admin_client.post(f"{ORDERS}/{uuid.uuid4()}/notify/sender")

        assert response.status_code == 404

    async def test_rejects_an_order_without_a_pickup_email(self, db, platform_admin_client, tenant, queued_tasks):
        order = await OrderFactory.create(db, vendor=tenant, pickup_email="")

        response = await platform_admin_client.post(f"{ORDERS}/{order.id}/notify/sender")

        assert response.status_code == 400
        assert queued_tasks == []


class TestSendRecipientNotification:
    """POST /orders/{id}/notify/recipient -- platform admin or the assigned driver."""

    async def test_platform_admin_queues_the_notification(self, platform_admin_client, order, queued_tasks):
        response = await platform_admin_client.post(f"{ORDERS}/{order.id}/notify/recipient")

        assert response.status_code == 200
        assert response.json()["email"] == "delivery@example.test"
        assert response.json()["tracking_url"].endswith(f"/t/{order.id}")
        assert "send_order_recipient_notification_email" in [n for n, _ in queued_tasks]

    async def test_assigned_driver_can_notify(self, driver_client, assigned_order, queued_tasks):
        response = await driver_client.post(f"{ORDERS}/{assigned_order.id}/notify/recipient")

        assert response.status_code == 200
        assert "send_order_recipient_notification_email" in [n for n, _ in queued_tasks]

    async def test_rejects_a_vendor_that_is_not_the_assigned_driver(self, vendor_client, assigned_order, queued_tasks):
        response = await vendor_client.post(f"{ORDERS}/{assigned_order.id}/notify/recipient")

        assert response.status_code == 403
        assert queued_tasks == []

    async def test_returns_404_for_an_unknown_order(self, platform_admin_client):
        response = await platform_admin_client.post(f"{ORDERS}/{uuid.uuid4()}/notify/recipient")

        assert response.status_code == 404

    async def test_rejects_an_order_without_a_delivery_email(self, db, platform_admin_client, tenant, queued_tasks):
        order = await OrderFactory.create(db, vendor=tenant, delivery_email="")

        response = await platform_admin_client.post(f"{ORDERS}/{order.id}/notify/recipient")

        assert response.status_code == 400
        assert queued_tasks == []


# ---------------------------------------------------------------------------
# Proof of delivery: photo/signature uploads and image read
# ---------------------------------------------------------------------------

IMAGE_BYTES = b"\xff\xd8\xff\xe0 fake jpeg bytes"


@pytest.fixture
def pod_uploads_dir(tmp_path, monkeypatch):
    """Redirect POD writes away from the real data/uploads tree (CLAUDE.md section 8)."""
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    return tmp_path


def _image(filename="pod.jpg", content_type="image/jpeg", content=IMAGE_BYTES):
    return {"file": (filename, content, content_type)}


@pytest.fixture
async def order_with_pod_photo(db, tenant, driver_tenant, pod_uploads_dir):
    """An order owned by `tenant`, assigned to `driver_tenant`, with a photo already
    on disk under the redirected uploads dir and referenced by proof_of_delivery."""
    order = await OrderFactory.create(db, vendor=tenant, driver=driver_tenant)
    pod_dir = pod_uploads_dir / "proof-of-delivery" / str(order.id)
    pod_dir.mkdir(parents=True, exist_ok=True)
    filepath = pod_dir / "pod.jpg"
    filepath.write_bytes(IMAGE_BYTES)
    order.proof_of_delivery = {"submission": {"photo_path": str(filepath)}}
    db.add(order)
    await db.flush()
    return order


class TestUploadProofOfDeliveryPhoto:
    async def test_assigned_driver_uploads_a_photo(self, db, driver_client, assigned_order, pod_uploads_dir):
        response = await driver_client.post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/photo", files=_image()
        )

        assert response.status_code == 200
        assert response.json()["success"] is True
        await db.refresh(assigned_order)
        photo_path = assigned_order.proof_of_delivery["submission"]["photo_path"]
        assert Path(photo_path).read_bytes() == IMAGE_BYTES

    async def test_platform_admin_can_upload(self, platform_admin_client, assigned_order, pod_uploads_dir):
        response = await platform_admin_client.post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/photo", files=_image()
        )

        assert response.status_code == 200

    async def test_rejects_a_driver_the_order_is_not_assigned_to(self, db, authenticate, assigned_order, pod_uploads_dir):
        stranger_tenant = await TenantFactory.create(db, name="Other Driver POD", role=TenantRole.driver)
        stranger = await UserFactory.create(db, tenant=stranger_tenant, roles=(RoleEnum.driver,))

        response = await authenticate(stranger).post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/photo", files=_image()
        )

        assert response.status_code == 403
        await db.refresh(assigned_order)
        assert (assigned_order.proof_of_delivery or {}).get("submission") is None

    async def test_rejects_the_owning_vendor(self, vendor_client, assigned_order, pod_uploads_dir):
        response = await vendor_client.post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/photo", files=_image()
        )

        assert response.status_code == 403

    async def test_rejects_a_disallowed_content_type(self, driver_client, assigned_order, pod_uploads_dir):
        response = await driver_client.post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/photo",
            files=_image(filename="doc.pdf", content_type="application/pdf"),
        )

        assert response.status_code == 400

    async def test_returns_404_for_an_unknown_order(self, driver_client, pod_uploads_dir):
        response = await driver_client.post(
            f"{ORDERS}/{uuid.uuid4()}/proof-of-delivery/photo", files=_image()
        )

        assert response.status_code == 404


class TestUploadProofOfDeliverySignature:
    async def test_assigned_driver_uploads_a_signature(self, db, driver_client, assigned_order, pod_uploads_dir):
        response = await driver_client.post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/signature",
            files=_image(filename="sig.png", content_type="image/png"),
            data={"recipient_name": "Jane Recipient"},
        )

        assert response.status_code == 200
        await db.refresh(assigned_order)
        submission = assigned_order.proof_of_delivery["submission"]
        assert submission["recipient_name"] == "Jane Recipient"
        assert Path(submission["signature_path"]).read_bytes() == IMAGE_BYTES

    async def test_rejects_a_blank_recipient_name(self, driver_client, assigned_order, pod_uploads_dir):
        response = await driver_client.post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/signature",
            files=_image(filename="sig.png", content_type="image/png"),
            data={"recipient_name": "   "},
        )

        assert response.status_code == 400

    async def test_rejects_a_driver_the_order_is_not_assigned_to(self, db, authenticate, assigned_order, pod_uploads_dir):
        stranger_tenant = await TenantFactory.create(db, name="Other Driver Sig", role=TenantRole.driver)
        stranger = await UserFactory.create(db, tenant=stranger_tenant, roles=(RoleEnum.driver,))

        response = await authenticate(stranger).post(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/signature",
            files=_image(filename="sig.png", content_type="image/png"),
            data={"recipient_name": "Jane"},
        )

        assert response.status_code == 403


class TestGetProofOfDeliveryImage:
    async def test_assigned_driver_downloads_the_photo(self, driver_client, order_with_pod_photo):
        response = await driver_client.get(
            f"{ORDERS}/{order_with_pod_photo.id}/proof-of-delivery/photo"
        )

        assert response.status_code == 200
        assert response.content == IMAGE_BYTES

    async def test_platform_admin_downloads_the_photo(self, platform_admin_client, order_with_pod_photo):
        response = await platform_admin_client.get(
            f"{ORDERS}/{order_with_pod_photo.id}/proof-of-delivery/photo"
        )

        assert response.status_code == 200

    async def test_owning_vendor_downloads_the_photo(self, vendor_client, order_with_pod_photo):
        response = await vendor_client.get(
            f"{ORDERS}/{order_with_pod_photo.id}/proof-of-delivery/photo"
        )

        assert response.status_code == 200

    async def test_rejects_an_unknown_kind(self, driver_client, order_with_pod_photo):
        response = await driver_client.get(
            f"{ORDERS}/{order_with_pod_photo.id}/proof-of-delivery/receipt"
        )

        assert response.status_code == 404

    async def test_returns_404_when_no_file_has_been_uploaded(self, driver_client, assigned_order, pod_uploads_dir):
        response = await driver_client.get(
            f"{ORDERS}/{assigned_order.id}/proof-of-delivery/photo"
        )

        assert response.status_code == 404

    async def test_returns_404_for_an_unknown_order(self, driver_client, pod_uploads_dir):
        response = await driver_client.get(
            f"{ORDERS}/{uuid.uuid4()}/proof-of-delivery/photo"
        )

        assert response.status_code == 404

    async def test_rejects_a_vendor_from_another_tenant(self, other_tenant_client, order_with_pod_photo):
        response = await other_tenant_client.get(
            f"{ORDERS}/{order_with_pod_photo.id}/proof-of-delivery/photo"
        )

        assert response.status_code == 403

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY (DISCOVERED_BUGS.md BUG-004 sibling): _authorize_pod_view widens "
        "vendor access with `order.pickup_name == tenant.name`, so a tenant named after the "
        "victim's pickup_name can read the delivery's POD image. Remove this marker once the "
        "pickup_name fallback is dropped from the POD view guard.",
    )
    async def test_does_not_leak_pod_to_a_vendor_named_after_the_pickup_name(
        self, db, authenticate, tenant, driver_tenant, pod_uploads_dir
    ):
        order = await OrderFactory.create(
            db, vendor=tenant, driver=driver_tenant, pickup_name="Impostor Target"
        )
        pod_dir = pod_uploads_dir / "proof-of-delivery" / str(order.id)
        pod_dir.mkdir(parents=True, exist_ok=True)
        (pod_dir / "pod.jpg").write_bytes(IMAGE_BYTES)
        order.proof_of_delivery = {"submission": {"photo_path": str(pod_dir / "pod.jpg")}}
        db.add(order)
        await db.flush()

        impostor_tenant = await TenantFactory.create(
            db, name="Impostor Target", role=TenantRole.vendor
        )
        impostor = await UserFactory.create(
            db, tenant=impostor_tenant, roles=(RoleEnum.tenant_admin,)
        )

        response = await authenticate(impostor).get(
            f"{ORDERS}/{order.id}/proof-of-delivery/photo"
        )

        assert response.status_code == 403
