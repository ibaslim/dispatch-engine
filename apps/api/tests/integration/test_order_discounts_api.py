"""Discounts on an order: the server prices them, and only off the delivery fee.

The create path runs the Google Maps quote, so these exercise PATCH, which
re-prices without a quote whenever the address and category are untouched.
"""
import pytest

from tests.factories import OrderFactory

pytestmark = pytest.mark.asyncio

ORDERS = "/api/v1/orders"


async def _order(db, **extra):
    """An order billed 100 goods + 5 GST + 20 fee + 5 tip, with no discount."""
    defaults = {
        "subtotal": 100.0,
        "gst_rate": 5.0,
        "gst_amount": 5.0,
        "pst_rate": 0.0,
        "pst_amount": 0.0,
        "delivery_fees": 20.0,
        "delivery_tips": 5.0,
        "discount": 0.0,
        "applied_discounts": [],
        "total": 130.0,
    }
    return await OrderFactory.create(db, **{**defaults, **extra})


class TestManualDiscount:
    async def test_percentage_is_priced_off_the_delivery_fee(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {
                "kind": "percentage", "value": 10, "reason": "late_delivery"
            }},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["discount"] == 2.0
        assert body["total"] == 128.0
        [line] = body["applied_discounts"]
        assert line["label"] == "Discount (10%)"
        assert line["amount"] == 2.0
        assert line["reason"] == "late_delivery"
        assert line["source"] == "manual"

    async def test_fixed_amount_is_priced_as_entered(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {
                "kind": "fixed_amount", "value": 7.5, "reason": "sales_goodwill"
            }},
        )

        assert response.json()["discount"] == 7.5
        assert response.json()["total"] == 122.5

    async def test_a_discount_never_exceeds_the_delivery_fee(self, db, platform_admin_client):
        """Goods value and tax are owed to the vendor, and the tip to the driver."""
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {
                "kind": "fixed_amount", "value": 500, "reason": "price_correction"
            }},
        )

        body = response.json()
        assert body["discount"] == 20.0
        # 100 goods + 5 GST + 5 tip still stand; only the 20 fee is given away.
        assert body["total"] == 110.0

    async def test_records_the_admin_who_applied_it(self, db, platform_admin, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {
                "kind": "percentage", "value": 5, "reason": "damaged_item"
            }},
        )

        [line] = response.json()["applied_discounts"]
        assert line["applied_by"] == str(platform_admin.id)

    async def test_a_client_cannot_set_the_discount_itself(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discount": 15.0}
        )

        assert response.status_code == 200
        assert response.json()["discount"] == 0.0
        assert response.json()["applied_discounts"] == []

    async def test_sending_null_clears_the_discount(self, db, platform_admin_client):
        order = await _order(
            db,
            discount=2.0,
            total=128.0,
            applied_discounts=[{
                "source": "manual", "kind": "percentage", "label": "Discount (10%)",
                "value": 10.0, "amount": 2.0, "reason": "late_delivery",
                "note": None, "applied_by": None,
            }],
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"manual_discount": None}
        )

        assert response.json()["discount"] == 0.0
        assert response.json()["applied_discounts"] == []
        assert response.json()["total"] == 130.0

    async def test_an_untouched_discount_survives_an_unrelated_edit(self, db, platform_admin_client):
        order = await _order(
            db,
            discount=2.0,
            total=128.0,
            applied_discounts=[{
                "source": "manual", "kind": "percentage", "label": "Discount (10%)",
                "value": 10.0, "amount": 2.0, "reason": "late_delivery",
                "note": None, "applied_by": None,
            }],
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"instructions": "Ring the bell"}
        )

        assert response.json()["discount"] == 2.0
        assert len(response.json()["applied_discounts"]) == 1

    async def test_a_percentage_follows_a_changed_fee(self, db, platform_admin_client):
        order = await _order(
            db,
            discount=2.0,
            total=128.0,
            applied_discounts=[{
                "source": "manual", "kind": "percentage", "label": "Discount (10%)",
                "value": 10.0, "amount": 2.0, "reason": "late_delivery",
                "note": None, "applied_by": None,
            }],
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 40.0}
        )

        body = response.json()
        assert body["discount"] == 4.0
        assert body["total"] == 146.0

    async def test_rejects_a_percentage_over_one_hundred(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {
                "kind": "percentage", "value": 150, "reason": "sales_goodwill"
            }},
        )

        assert response.status_code == 422

    async def test_rejects_other_without_a_note(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {"kind": "percentage", "value": 10, "reason": "other"}},
        )

        assert response.status_code == 422

    async def test_a_tenant_user_cannot_apply_one(self, db, tenant, tenant_admin_client):
        order = await _order(db, vendor=tenant)

        response = await tenant_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"manual_discount": {
                "kind": "percentage", "value": 10, "reason": "sales_goodwill"
            }},
        )

        assert response.status_code == 403


class TestDriverVisibility:
    async def test_a_driver_is_not_shown_the_discount(self, db, driver_tenant, driver_client):
        await _order(
            db,
            driver=driver_tenant,
            discount=2.0,
            total=128.0,
            applied_discounts=[{
                "source": "manual", "kind": "percentage", "label": "Discount (10%)",
                "value": 10.0, "amount": 2.0, "reason": "late_delivery",
                "note": None, "applied_by": None,
            }],
        )

        response = await driver_client.get(ORDERS)

        [body] = response.json()
        assert body["discount"] == 0
        assert body["applied_discounts"] == []
