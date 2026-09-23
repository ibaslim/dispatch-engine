"""Admin CRUD for discount types and discounts."""
import pytest

from app.models.discount import DiscountKind, DiscountStatus
from tests.factories import DiscountFactory, DiscountTypeFactory, OrderFactory

pytestmark = pytest.mark.asyncio

DISCOUNTS = "/api/v1/discounts"
TYPES = f"{DISCOUNTS}/types"


def _payload(**overrides) -> dict:
    payload = {
        "title": "Late delivery 10%",
        "kind": "percentage",
        "value": 10,
        "status": "active",
        "reason": "late_delivery",
    }
    payload.update(overrides)
    return payload


class TestDiscountTypes:
    async def test_an_admin_creates_one(self, platform_admin_client):
        response = await platform_admin_client.post(
            TYPES, json={"title": "Service recovery", "description": "Something went wrong"}
        )

        assert response.status_code == 201
        assert response.json()["title"] == "Service recovery"

    async def test_titles_are_unique(self, db, platform_admin_client):
        existing = await DiscountTypeFactory.create(db)
        await db.commit()

        response = await platform_admin_client.post(TYPES, json={"title": existing.title})

        assert response.status_code == 409

    async def test_the_list_counts_what_uses_each_type(self, db, platform_admin_client):
        discount_type = await DiscountTypeFactory.create(db)
        await DiscountFactory.create(db, discount_type=discount_type)
        await db.commit()

        response = await platform_admin_client.get(TYPES)

        [body] = [item for item in response.json() if item["id"] == str(discount_type.id)]
        assert body["discount_count"] == 1

    async def test_a_type_in_use_cannot_be_deleted(self, db, platform_admin_client):
        discount_type = await DiscountTypeFactory.create(db)
        await DiscountFactory.create(db, discount_type=discount_type)
        await db.commit()

        response = await platform_admin_client.delete(f"{TYPES}/{discount_type.id}")

        assert response.status_code == 409
        assert "Move them first" in response.json()["detail"]

    async def test_an_unused_type_is_deleted(self, db, platform_admin_client):
        discount_type = await DiscountTypeFactory.create(db)
        await db.commit()

        response = await platform_admin_client.delete(f"{TYPES}/{discount_type.id}")

        assert response.status_code == 204

    async def test_a_tenant_user_is_refused(self, tenant_admin_client):
        response = await tenant_admin_client.get(TYPES)

        assert response.status_code == 403


class TestDiscounts:
    async def test_an_admin_creates_one(self, platform_admin_client):
        response = await platform_admin_client.post(DISCOUNTS, json=_payload())

        assert response.status_code == 201
        body = response.json()
        assert body["title"] == "Late delivery 10%"
        # The receipt label falls back to the title when none is given.
        assert body["public_label"] == "Late delivery 10%"
        assert body["trigger"] == "manual"
        assert body["redemption_count"] == 0

    async def test_a_percentage_over_one_hundred_is_refused(self, platform_admin_client):
        response = await platform_admin_client.post(DISCOUNTS, json=_payload(value=150))

        assert response.status_code == 422

    async def test_a_backwards_window_is_refused(self, platform_admin_client):
        response = await platform_admin_client.post(
            DISCOUNTS,
            json=_payload(starts_at="2026-12-01T00:00:00Z", ends_at="2026-11-01T00:00:00Z"),
        )

        assert response.status_code == 422

    async def test_an_unknown_type_is_refused(self, platform_admin_client):
        response = await platform_admin_client.post(
            DISCOUNTS,
            json=_payload(discount_type_id="11111111-1111-1111-1111-111111111111"),
        )

        assert response.status_code == 422

    async def test_the_order_form_lists_only_pickable_ones(self, db, platform_admin_client):
        await DiscountFactory.create(db, title="Live one")
        await DiscountFactory.create(db, title="Draft one", status=DiscountStatus.draft)
        await db.commit()

        response = await platform_admin_client.get(
            DISCOUNTS, params={"trigger": "manual", "status": "active"}
        )

        titles = [item["title"] for item in response.json()]
        assert "Live one" in titles
        assert "Draft one" not in titles

    async def test_the_list_carries_the_type_title(self, db, platform_admin_client):
        discount_type = await DiscountTypeFactory.create(db, title="Service recovery")
        await DiscountFactory.create(db, discount_type=discount_type)
        await db.commit()

        [body] = [
            item
            for item in (await platform_admin_client.get(DISCOUNTS)).json()
            if item["discount_type_id"] == str(discount_type.id)
        ]
        assert body["discount_type_title"] == discount_type.title

    async def test_terms_are_editable_before_it_is_given(self, db, platform_admin_client):
        discount = await DiscountFactory.create(db)
        await db.commit()

        response = await platform_admin_client.patch(
            f"{DISCOUNTS}/{discount.id}", json={"value": 15}
        )

        assert response.status_code == 200
        assert response.json()["value"] == 15.0

    async def test_terms_are_fixed_once_it_has_been_given(self, db, platform_admin_client):
        discount = await DiscountFactory.create(db, redemption_count=1)
        await db.commit()

        response = await platform_admin_client.patch(
            f"{DISCOUNTS}/{discount.id}", json={"value": 15}
        )

        assert response.status_code == 409
        assert "Copy it into a new discount" in response.json()["detail"]

    async def test_naming_stays_editable_once_it_has_been_given(
        self, db, platform_admin_client
    ):
        discount = await DiscountFactory.create(db, redemption_count=1)
        await db.commit()

        response = await platform_admin_client.patch(
            f"{DISCOUNTS}/{discount.id}", json={"title": "Late delivery (autumn)"}
        )

        assert response.status_code == 200
        assert response.json()["title"] == "Late delivery (autumn)"

    async def test_a_used_discount_cannot_be_deleted(self, db, platform_admin_client):
        discount = await DiscountFactory.create(db, redemption_count=1)
        await db.commit()

        response = await platform_admin_client.delete(f"{DISCOUNTS}/{discount.id}")

        assert response.status_code == 409
        assert "archived" in response.json()["detail"]

    async def test_an_unused_discount_is_deleted(self, db, platform_admin_client):
        discount = await DiscountFactory.create(db)
        await db.commit()

        response = await platform_admin_client.delete(f"{DISCOUNTS}/{discount.id}")

        assert response.status_code == 204

    async def test_a_tenant_user_cannot_create_one(self, tenant_admin_client):
        response = await tenant_admin_client.post(DISCOUNTS, json=_payload())

        assert response.status_code == 403


class TestReports:
    async def test_usage_sums_what_each_discount_gave_away(
        self, db, platform_admin_client
    ):
        discount = await DiscountFactory.create(
            db, title="Goodwill", kind=DiscountKind.fixed_amount, value="5"
        )
        order = await OrderFactory.create(db, delivery_fees=20.0, total=20.0)
        await platform_admin_client.patch(
            f"/api/v1/orders/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        response = await platform_admin_client.get(f"{DISCOUNTS}/reports/usage")

        [row] = [item for item in response.json() if item["discount_id"] == str(discount.id)]
        assert row["uses"] == 1
        assert row["total_amount"] == 5.0

    async def test_redemptions_are_listed_for_one_discount(
        self, db, platform_admin_client
    ):
        discount = await DiscountFactory.create(db)
        order = await OrderFactory.create(db, delivery_fees=20.0, total=20.0)
        await platform_admin_client.patch(
            f"/api/v1/orders/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        response = await platform_admin_client.get(f"{DISCOUNTS}/{discount.id}/redemptions")

        [row] = response.json()
        assert row["order_number"] == order.order_number
        assert row["amount"] == 2.0
