"""Applying admin-created discounts to an order.

The create path runs the Google Maps quote, so these exercise PATCH, which
prices without a quote whenever the address and category are untouched.
"""
import pytest
from sqlalchemy import select

from app.models.discount import (
    Discount,
    DiscountKind,
    DiscountRedemption,
    DiscountValueMode,
    RedemptionStatus,
)
from tests.factories import DiscountFactory, OrderFactory

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


class TestApplyingDiscounts:
    async def test_a_percentage_comes_off_the_delivery_fee(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(db, title="Late delivery", value="10")

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["discount"] == 2.0
        assert body["total"] == 128.0
        [line] = body["applied_discounts"]
        assert line["discount_id"] == str(discount.id)
        assert line["label"] == "Late delivery"
        assert line["amount"] == 2.0

    async def test_several_discounts_price_in_turn(self, db, platform_admin_client):
        order = await _order(db)
        flat = await DiscountFactory.create(
            db, title="Goodwill", kind=DiscountKind.fixed_amount, value="5"
        )
        percent = await DiscountFactory.create(db, title="Late delivery", value="10")

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(flat.id)}, {"discount_id": str(percent.id)}]},
        )

        body = response.json()
        # 5 off first, then 10% of the remaining 15.
        assert [line["amount"] for line in body["applied_discounts"]] == [5.0, 1.5]
        assert body["discount"] == 6.5

    async def test_the_total_discount_never_exceeds_the_fee(self, db, platform_admin_client):
        """Goods value and tax are owed to the vendor, and the tip to the driver."""
        order = await _order(db)
        huge = await DiscountFactory.create(
            db, title="Write-off", kind=DiscountKind.fixed_amount, value="500"
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(huge.id)}]}
        )

        body = response.json()
        assert body["discount"] == 20.0
        assert body["total"] == 110.0

    async def test_a_note_is_recorded_against_the_line(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={
                "discounts": [{"discount_id": str(discount.id)}],
                "discount_note": "Agreed with the vendor",
            },
        )

        [line] = response.json()["applied_discounts"]
        assert line["note"] == "Agreed with the vendor"

    async def test_an_empty_list_clears_them(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": []}
        )

        assert response.json()["discount"] == 0.0
        assert response.json()["applied_discounts"] == []
        assert response.json()["total"] == 130.0

    async def test_an_unrelated_edit_leaves_them_alone(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"instructions": "Ring the bell"}
        )

        assert response.status_code == 200, response.json()
        assert response.json()["discount"] == 2.0
        assert len(response.json()["applied_discounts"]) == 1

    async def test_a_percentage_follows_a_changed_fee(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 40.0}
        )

        assert response.json()["discount"] == 4.0
        assert response.json()["total"] == 146.0

    async def test_a_client_cannot_set_the_amount_itself(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discount": 15.0}
        )

        assert response.json()["discount"] == 0.0
        assert response.json()["applied_discounts"] == []

    async def test_a_tenant_user_cannot_apply_one(self, db, tenant, tenant_admin_client):
        order = await _order(db, vendor=tenant)
        discount = await DiscountFactory.create(db)

        response = await tenant_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        assert response.status_code == 403


class TestRefusedSelections:
    async def test_an_unknown_discount_is_refused(self, db, platform_admin_client):
        order = await _order(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": "11111111-1111-1111-1111-111111111111"}]},
        )

        assert response.status_code == 422
        assert "no longer exists" in response.json()["detail"]

    async def test_a_draft_discount_is_refused(self, db, platform_admin_client):
        from app.models.discount import DiscountStatus

        order = await _order(db)
        discount = await DiscountFactory.create(
            db, title="Not live yet", status=DiscountStatus.draft
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        assert response.status_code == 422
        assert "Not live yet is not active." == response.json()["detail"]

    async def test_a_finished_discount_is_refused(self, db, platform_admin_client):
        from datetime import datetime, timedelta, timezone

        order = await _order(db)
        discount = await DiscountFactory.create(
            db,
            title="Summer promo",
            ends_at=datetime.now(timezone.utc) - timedelta(days=1),
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        assert response.status_code == 422
        assert "has ended" in response.json()["detail"]

    async def test_a_used_up_discount_is_refused(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(
            db, title="One only", usage_limit_total=1, redemption_count=1
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        assert response.status_code == 422
        assert "usage limit" in response.json()["detail"]


class TestRedemptions:
    async def test_applying_one_records_a_redemption(self, db, tenant, platform_admin_client):
        order = await _order(db, vendor=tenant)
        discount = await DiscountFactory.create(db, title="Late delivery")

        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        redemption = await db.scalar(
            select(DiscountRedemption).where(DiscountRedemption.discount_id == discount.id)
        )
        assert redemption.status == RedemptionStatus.applied
        assert float(redemption.amount) == 2.0
        assert redemption.order_id == order.id
        assert redemption.order_number == order.order_number
        assert redemption.tenant_id == tenant.id
        # The terms are copied, so editing the discount later cannot rewrite them.
        assert redemption.snapshot["value"] == "10.00"

        await db.refresh(discount)
        assert discount.redemption_count == 1

    async def test_removing_one_voids_its_redemption_and_frees_the_use(
        self, db, platform_admin_client
    ):
        order = await _order(db)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"discounts": []})

        redemption = await db.scalar(
            select(DiscountRedemption).where(DiscountRedemption.discount_id == discount.id)
        )
        assert redemption.status == RedemptionStatus.voided
        assert redemption.voided_reason == "no_longer_applied"
        await db.refresh(discount)
        assert discount.redemption_count == 0

    async def test_a_changed_fee_updates_the_recorded_amount(self, db, platform_admin_client):
        order = await _order(db)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 40.0})

        redemption = await db.scalar(
            select(DiscountRedemption).where(DiscountRedemption.discount_id == discount.id)
        )
        assert float(redemption.amount) == 4.0

    async def test_deleting_the_order_keeps_the_record_and_frees_the_use(
        self, db, platform_admin_client
    ):
        order = await _order(db)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        await platform_admin_client.delete(f"{ORDERS}/{order.id}")

        redemption = await db.scalar(
            select(DiscountRedemption).where(DiscountRedemption.discount_id == discount.id)
        )
        assert redemption.status == RedemptionStatus.voided
        assert redemption.voided_reason == "order_deleted"
        assert redemption.order_id is None
        # The order number survives, so the report still names it.
        assert redemption.order_number == order.order_number
        assert (await db.get(Discount, discount.id)).redemption_count == 0


class TestDriverVisibility:
    async def test_a_driver_is_not_shown_the_discount(
        self, db, driver_tenant, platform_admin_client, driver_client
    ):
        order = await _order(db, driver=driver_tenant)
        discount = await DiscountFactory.create(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(discount.id)}]}
        )

        response = await driver_client.get(ORDERS)

        [body] = response.json()
        assert body["discount"] == 0
        assert body["applied_discounts"] == []


class TestValueEnteredOnTheOrder:
    """A goodwill discount has no set size until the dispatcher decides one."""

    async def test_the_typed_value_is_priced(self, db, platform_admin_client):
        order = await _order(db)
        goodwill = await DiscountFactory.create(
            db, title="Goodwill", value=None, value_mode=DiscountValueMode.entered
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(goodwill.id), "value": 25}]},
        )

        assert response.status_code == 200
        body = response.json()
        # 25% of the 20 fee.
        assert body["discount"] == 5.0
        [line] = body["applied_discounts"]
        assert line["value"] == 25.0

    async def test_a_typed_amount_works_too(self, db, platform_admin_client):
        order = await _order(db)
        goodwill = await DiscountFactory.create(
            db,
            title="Goodwill",
            kind=DiscountKind.fixed_amount,
            value=None,
            value_mode=DiscountValueMode.entered,
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(goodwill.id), "value": 7.5}]},
        )

        assert response.json()["discount"] == 7.5

    async def test_it_is_refused_without_a_value(self, db, platform_admin_client):
        order = await _order(db)
        goodwill = await DiscountFactory.create(
            db, title="Goodwill", value=None, value_mode=DiscountValueMode.entered
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(goodwill.id)}]}
        )

        assert response.status_code == 422
        assert "Enter an amount for Goodwill." == response.json()["detail"]

    async def test_a_typed_percentage_over_one_hundred_is_refused(
        self, db, platform_admin_client
    ):
        order = await _order(db)
        goodwill = await DiscountFactory.create(
            db, title="Goodwill", value=None, value_mode=DiscountValueMode.entered
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(goodwill.id), "value": 150}]},
        )

        assert response.status_code == 422
        assert "cannot be more than 100%" in response.json()["detail"]

    async def test_a_fixed_discount_ignores_a_sent_value(self, db, platform_admin_client):
        """The admin set 10%; the order cannot talk it up to 50%."""
        order = await _order(db)
        fixed = await DiscountFactory.create(db, title="Late delivery", value="10")

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(fixed.id), "value": 50}]},
        )

        assert response.json()["discount"] == 2.0

    async def test_the_typed_value_survives_an_unrelated_edit(self, db, platform_admin_client):
        order = await _order(db)
        goodwill = await DiscountFactory.create(
            db, title="Goodwill", value=None, value_mode=DiscountValueMode.entered
        )
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(goodwill.id), "value": 25}]},
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 40.0}
        )

        # Still 25%, now of the larger fee.
        assert response.json()["discount"] == 10.0


class TestScheduledDiscounts:
    async def test_it_applies_on_a_matching_day(self, db, platform_admin_client):
        # The order's pickup is 2026-08-27, a Thursday.
        order = await _order(db)
        thursday = await DiscountFactory.create(
            db, title="Thursday promo", schedule={"kind": "weekly", "days": [3]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(thursday.id)}]}
        )

        assert response.status_code == 200
        assert response.json()["discount"] == 2.0

    async def test_it_is_refused_on_another_day(self, db, platform_admin_client):
        order = await _order(db)
        monday = await DiscountFactory.create(
            db, title="Monday promo", schedule={"kind": "weekly", "days": [0]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(monday.id)}]}
        )

        assert response.status_code == 422
        assert "only applies on mon" in response.json()["detail"].lower()

    async def test_a_yearly_date_is_refused_out_of_season(self, db, platform_admin_client):
        order = await _order(db)
        christmas = await DiscountFactory.create(
            db, title="Christmas", schedule={"kind": "annual", "month": 12, "day": 25}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(christmas.id)}]}
        )

        assert response.status_code == 422
        assert "25 december" in response.json()["detail"].lower()

    async def test_the_picker_list_filters_by_the_pickup_day(self, db, platform_admin_client):
        await DiscountFactory.create(
            db, title="Thursday promo", schedule={"kind": "weekly", "days": [3]}
        )
        await DiscountFactory.create(
            db, title="Monday promo", schedule={"kind": "weekly", "days": [0]}
        )
        await db.commit()

        response = await platform_admin_client.get(
            "/api/v1/discounts",
            params={"trigger": "manual", "status": "active", "at": "2026-08-27T10:00:00"},
        )

        titles = [item["title"] for item in response.json()]
        assert "Thursday promo" in titles
        assert "Monday promo" not in titles

    async def test_the_list_explains_when_each_applies(self, db, platform_admin_client):
        await DiscountFactory.create(
            db,
            title="Black Friday",
            schedule={
                "kind": "annual_nth_weekday",
                "month": 11,
                "weekday": 3,
                "nth": 4,
                "offset_days": 1,
            },
        )
        await db.commit()

        response = await platform_admin_client.get("/api/v1/discounts")

        [body] = [item for item in response.json() if item["title"] == "Black Friday"]
        assert body["schedule_label"] == (
            "The fourth Thursday of November, 1 day later, every year"
        )


class TestAutomaticDiscounts:
    """A scheduled discount applies by itself; a dispatcher can take it off."""

    # The factory order's pickup is 2026-08-27, a Thursday.
    THURSDAY = {"kind": "weekly", "days": [3]}

    async def _thursday_promo(self, db, **extra):
        from app.models.discount import DiscountTrigger

        return await DiscountFactory.create(
            db,
            title="Thursday promo",
            value="10",
            trigger=DiscountTrigger.automatic,
            schedule=self.THURSDAY,
            **extra,
        )

    async def test_it_applies_without_being_picked(self, db, platform_admin_client):
        order = await _order(db)
        promo = await self._thursday_promo(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0}
        )

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["discount"] == 3.0
        [line] = body["applied_discounts"]
        assert line["discount_id"] == str(promo.id)
        assert line["source"] == "automatic"
        # Nobody applied it, so no admin is named on it.
        assert line["applied_by"] is None

    async def test_it_does_not_apply_on_another_day(self, db, platform_admin_client):
        from app.models.discount import DiscountTrigger

        order = await _order(db)
        await DiscountFactory.create(
            db,
            title="Monday promo",
            trigger=DiscountTrigger.automatic,
            schedule={"kind": "weekly", "days": [0]},
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0}
        )

        assert response.json()["applied_discounts"] == []

    async def test_a_dispatcher_can_opt_an_order_out(self, db, platform_admin_client):
        order = await _order(db)
        promo = await self._thursday_promo(db)
        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0})

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"opted_out_discount_ids": [str(promo.id)]}
        )

        assert response.json()["applied_discounts"] == []
        assert response.json()["discount"] == 0.0

    async def test_an_opt_out_survives_later_edits(self, db, platform_admin_client):
        """Otherwise the next fee change would quietly put it back."""
        order = await _order(db)
        promo = await self._thursday_promo(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"opted_out_discount_ids": [str(promo.id)]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 40.0}
        )

        assert response.json()["applied_discounts"] == []

    async def test_clearing_the_opt_out_applies_it_again(self, db, platform_admin_client):
        order = await _order(db)
        promo = await self._thursday_promo(db)
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"opted_out_discount_ids": [str(promo.id)]}
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"opted_out_discount_ids": []}
        )

        assert response.json()["discount"] == 2.0

    async def test_only_the_best_automatic_offer_applies(self, db, platform_admin_client):
        from app.models.discount import DiscountTrigger

        order = await _order(db)
        await self._thursday_promo(db)
        bigger = await DiscountFactory.create(
            db,
            title="Big Thursday",
            value="25",
            trigger=DiscountTrigger.automatic,
            schedule=self.THURSDAY,
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 20.0}
        )

        [line] = response.json()["applied_discounts"]
        assert line["discount_id"] == str(bigger.id)
        assert response.json()["discount"] == 5.0

    async def test_opting_out_of_the_best_falls_back_to_the_next(self, db, platform_admin_client):
        from app.models.discount import DiscountTrigger

        order = await _order(db)
        smaller = await self._thursday_promo(db)
        bigger = await DiscountFactory.create(
            db,
            title="Big Thursday",
            value="25",
            trigger=DiscountTrigger.automatic,
            schedule=self.THURSDAY,
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"delivery_fees": 20.0, "opted_out_discount_ids": [str(bigger.id)]},
        )

        [line] = response.json()["applied_discounts"]
        assert line["discount_id"] == str(smaller.id)

    async def test_it_stacks_with_a_hand_picked_discount(self, db, platform_admin_client):
        order = await _order(db)
        await self._thursday_promo(db)
        goodwill = await DiscountFactory.create(
            db, title="Goodwill", kind=DiscountKind.fixed_amount, value="5"
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"delivery_fees": 20.0, "discounts": [{"discount_id": str(goodwill.id)}]},
        )

        lines = response.json()["applied_discounts"]
        # 10% of 20 first, then 5 off what is left; still capped at the fee.
        assert [line["amount"] for line in lines] == [2.0, 5.0]
        assert response.json()["discount"] == 7.0

    async def test_an_unrelated_edit_leaves_it_alone(self, db, platform_admin_client):
        order = await _order(db)
        await self._thursday_promo(db)
        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0})

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"instructions": "Ring the bell"}
        )

        assert response.json()["discount"] == 3.0

    async def test_it_stays_on_an_order_after_the_promotion_ends(self, db, platform_admin_client):
        """It was valid when the order was booked; ending it later must not block edits."""
        from app.models.discount import DiscountStatus

        order = await _order(db)
        promo = await self._thursday_promo(db)
        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0})
        promo.status = DiscountStatus.ended
        await db.flush()

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"instructions": "Ring the bell"}
        )

        assert response.status_code == 200
        assert response.json()["discount"] == 3.0

    async def test_it_is_dropped_when_the_pickup_moves_off_its_days(
        self, db, platform_admin_client
    ):
        from datetime import datetime

        # Thursday 2036-10-02 pickup, delivered the week after.
        order = await _order(
            db,
            pickup_planned_at=datetime(2036, 10, 2, 10, 0),
            delivery_planned_at=datetime(2036, 10, 9, 12, 0),
        )
        await self._thursday_promo(db)
        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0})

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"pickup_planned_at": "2036-10-03T10:00:00"}
        )

        assert response.status_code == 200, response.json()
        assert response.json()["applied_discounts"] == []

    async def test_it_records_a_redemption_with_no_admin(self, db, platform_admin_client):
        order = await _order(db)
        promo = await self._thursday_promo(db)

        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0})

        redemption = await db.scalar(
            select(DiscountRedemption).where(DiscountRedemption.discount_id == promo.id)
        )
        assert redemption.source.value == "automatic"
        assert redemption.applied_by is None
        assert float(redemption.amount) == 3.0

    async def test_a_dispatcher_cannot_pick_an_automatic_one_by_hand(
        self, db, platform_admin_client
    ):
        order = await _order(db)
        promo = await self._thursday_promo(db)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(promo.id)}]}
        )

        assert response.status_code == 422
        assert "applied automatically" in response.json()["detail"]

    async def test_the_order_form_can_preview_what_would_apply(self, db, platform_admin_client):
        promo = await self._thursday_promo(db)
        await db.commit()

        response = await platform_admin_client.get(
            "/api/v1/discounts/automatic",
            params={"at": "2026-08-27T10:00:00", "delivery_fee": 20},
        )

        [offer] = response.json()
        assert offer["discount"]["id"] == str(promo.id)
        assert offer["state"] == "applied"
        assert offer["amount"] == 2.0

    async def test_the_preview_reports_an_opt_out(self, db, platform_admin_client):
        promo = await self._thursday_promo(db)
        await db.commit()

        response = await platform_admin_client.get(
            "/api/v1/discounts/automatic",
            params={
                "at": "2026-08-27T10:00:00",
                "delivery_fee": 20,
                "opted_out": str(promo.id),
            },
        )

        assert response.json()[0]["state"] == "opted_out"

    async def test_the_preview_waits_for_a_fee(self, db, platform_admin_client):
        await self._thursday_promo(db)
        await db.commit()

        response = await platform_admin_client.get(
            "/api/v1/discounts/automatic", params={"at": "2026-08-27T10:00:00"}
        )

        assert response.json()[0]["state"] == "waiting"

    async def test_the_preview_skips_the_wrong_day(self, db, platform_admin_client):
        await self._thursday_promo(db)
        await db.commit()

        response = await platform_admin_client.get(
            "/api/v1/discounts/automatic",
            params={"at": "2026-08-28T10:00:00", "delivery_fee": 20},
        )

        assert response.json() == []


class TestAutomaticRules:
    async def test_an_automatic_discount_cannot_take_a_typed_value(self, platform_admin_client):
        response = await platform_admin_client.post(
            "/api/v1/discounts",
            json={
                "title": "Friday",
                "kind": "percentage",
                "value_mode": "entered",
                "trigger": "automatic",
                "status": "active",
            },
        )

        assert response.status_code == 422
        assert "fixed amount" in response.text

    async def test_a_coupon_discount_can_be_created(self, platform_admin_client):
        response = await platform_admin_client.post(
            "/api/v1/discounts",
            json={
                "title": "Coupon",
                "kind": "percentage",
                "value": 10,
                "trigger": "code",
                "status": "active",
            },
        )

        assert response.status_code == 201


class TestKeepingWhatIsAlreadyOnTheOrder:
    THURSDAY = {"kind": "weekly", "days": [3]}

    async def test_a_full_save_keeps_an_automatic_discount_that_has_since_ended(
        self, db, platform_admin_client
    ):
        """The form always resends the order, so the end date must not cost it its discount."""
        from app.models.discount import DiscountStatus, DiscountTrigger

        order = await _order(db)
        promo = await DiscountFactory.create(
            db, title="Thursday promo", trigger=DiscountTrigger.automatic, schedule=self.THURSDAY
        )
        await platform_admin_client.patch(f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0})
        promo.status = DiscountStatus.ended
        await db.flush()

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 40.0}
        )

        assert response.json()["discount"] == 4.0

    async def test_a_new_order_does_not_get_an_ended_automatic_discount(
        self, db, platform_admin_client
    ):
        from app.models.discount import DiscountStatus, DiscountTrigger

        order = await _order(db)
        await DiscountFactory.create(
            db,
            title="Old promo",
            trigger=DiscountTrigger.automatic,
            schedule=self.THURSDAY,
            status=DiscountStatus.ended,
        )

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"delivery_fees": 30.0}
        )

        assert response.json()["applied_discounts"] == []

    async def test_resending_an_ended_hand_picked_discount_does_not_block_the_save(
        self, db, platform_admin_client
    ):
        from app.models.discount import DiscountStatus

        order = await _order(db)
        goodwill = await DiscountFactory.create(db, title="Goodwill", value="10")
        await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"discounts": [{"discount_id": str(goodwill.id)}]}
        )
        goodwill.status = DiscountStatus.ended
        await db.flush()

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"discounts": [{"discount_id": str(goodwill.id)}], "delivery_fees": 40.0},
        )

        assert response.status_code == 200, response.json()
        assert response.json()["discount"] == 4.0
