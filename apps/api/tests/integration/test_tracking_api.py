"""Tests for GET /api/v1/tracking/{token}/order (public order tracking).

Damage if these break:
  field whitelist -> the public tracking page leaks contact, payment, or pricing data
  lookup          -> a valid tracking link stops resolving the order
  not-found       -> an unknown token reveals whether an order exists via status codes

This endpoint is intentionally PUBLIC (no auth) and resolves by the order's UUID or by
its order_number. The order_number path is a documented feature but is also an enumeration
surface (order numbers are sequential, e.g. ORD20082601); tightening that is a product
decision tracked as T5 -- not asserted here.
"""
import uuid

import pytest

from tests.factories import OrderFactory
from tests.utils import API

pytestmark = pytest.mark.integration

TRACKING = f"{API}/tracking"

# Fields the public payload must never carry (PublicOrderTracking is the whitelist).
FORBIDDEN_FIELDS = {
    "pickup_phone",
    "pickup_email",
    "delivery_phone",
    "delivery_email",
    "payment_method",
    "payment_details",
    "subtotal",
    "tax_amount",
    "tax_rate",
    "total",
    "delivery_fees",
    "delivery_tips",
    "discount",
    "instructions",
    "vendor_id",
    "applied_charges",
}


class TestGetTrackingOrder:
    async def test_resolves_an_order_by_its_uuid(self, db, client, tenant):
        order = await OrderFactory.create(db, vendor=tenant)

        response = await client.get(f"{TRACKING}/{order.id}/order")

        assert response.status_code == 200
        body = response.json()
        assert body["order_number"] == order.order_number
        assert body["delivery_name"] == "Delivery Contact"

    async def test_resolves_an_order_by_its_order_number(self, db, client, tenant):
        order = await OrderFactory.create(db, vendor=tenant)

        response = await client.get(f"{TRACKING}/{order.order_number}/order")

        assert response.status_code == 200
        assert response.json()["order_number"] == order.order_number

    async def test_order_number_is_matched_case_insensitively(self, db, client, tenant):
        order = await OrderFactory.create(db, vendor=tenant)

        response = await client.get(f"{TRACKING}/{order.order_number.lower()}/order")

        assert response.status_code == 200
        assert response.json()["order_number"] == order.order_number

    async def test_is_public_no_authentication_required(self, db, client, tenant):
        """The tracking page is reached by recipients with no account."""
        order = await OrderFactory.create(db, vendor=tenant)

        # `client` carries no Authorization header.
        response = await client.get(f"{TRACKING}/{order.id}/order")

        assert response.status_code == 200

    async def test_exposes_only_recipient_relevant_fields(self, db, client, tenant):
        """The public payload must not leak contact, payment, or pricing data."""
        order = await OrderFactory.create(db, vendor=tenant)

        response = await client.get(f"{TRACKING}/{order.id}/order")

        assert response.status_code == 200
        leaked = FORBIDDEN_FIELDS.intersection(response.json())
        assert leaked == set(), f"tracking payload leaked: {leaked}"

    async def test_includes_the_assigned_driver(self, db, client, tenant, driver_tenant):
        order = await OrderFactory.create(db, vendor=tenant, driver=driver_tenant)

        response = await client.get(f"{TRACKING}/{order.id}/order")

        body = response.json()
        assert body["driver_id"] == str(driver_tenant.id)
        assert body["driver_name"] == driver_tenant.name

    async def test_returns_404_for_an_unknown_uuid(self, client):
        response = await client.get(f"{TRACKING}/{uuid.uuid4()}/order")

        assert response.status_code == 404

    async def test_returns_404_for_an_unknown_order_number(self, client):
        response = await client.get(f"{TRACKING}/ORD99999999/order")

        assert response.status_code == 404
