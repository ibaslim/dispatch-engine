"""Saving an order again when it already carries a coupon.

The order form sends the order's coupon_code on every save, changed or not. Damage if the
server counts that as a new coupon:
  single-use code  -> the order that holds the use is refused its own re-save
  shared code      -> every re-save burns another use, so a code runs out early
This exercises PATCH, which prices without a Google quote while the addresses are untouched.
"""
import pytest

from app.models.discount import Coupon, DiscountTrigger
from tests.factories import DiscountFactory, OrderFactory

pytestmark = pytest.mark.asyncio

ORDERS = "/api/v1/orders"


async def _order(db):
    """An order billed 100 goods + 5 GST + 20 fee + 5 tip, with no discount."""
    return await OrderFactory.create(
        db,
        subtotal=100.0, gst_rate=5.0, gst_amount=5.0, pst_rate=0.0, pst_amount=0.0,
        delivery_fees=20.0, delivery_tips=5.0, discount=0.0, applied_discounts=[], total=130.0,
    )


async def _coupon(db, code="WC26", max_uses=None, title="Monday Loot", value="10"):
    discount = await DiscountFactory.create(db, title=title, value=value, trigger=DiscountTrigger.code)
    coupon = Coupon(discount_id=discount.id, code=code, max_uses=max_uses, used_count=0)
    db.add(coupon)
    await db.flush()
    return discount, coupon


async def _apply(client, order, code="WC26"):
    response = await client.patch(f"{ORDERS}/{order.id}", json={"coupon_code": code})
    assert response.status_code == 200, response.text
    return response.json()


async def _used(db, coupon) -> int:
    await db.refresh(coupon)
    return coupon.used_count


class TestSavingAgainWithTheSameCode:
    async def test_a_single_use_coupon_stays_applied(self, db, platform_admin_client):
        order = await _order(db)
        discount, coupon = await _coupon(db, max_uses=1)
        first = await _apply(platform_admin_client, order)
        assert first["discount"] == 2.0

        # What the form sends on a later save: the same code, and no hand-picked discounts.
        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}",
            json={"coupon_code": "WC26", "discounts": [], "instructions": "Ring the bell"},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["discount"] == 2.0
        [line] = body["applied_discounts"]
        assert (line["discount_id"], line["source"]) == (str(discount.id), "code")
        assert await _used(db, coupon) == 1

    async def test_a_shared_coupon_is_not_used_up_by_saving_again(self, db, platform_admin_client):
        order = await _order(db)
        _, coupon = await _coupon(db)
        await _apply(platform_admin_client, order)

        for _ in range(3):
            response = await platform_admin_client.patch(
                f"{ORDERS}/{order.id}", json={"coupon_code": "WC26", "discounts": []}
            )
            assert response.status_code == 200, response.text

        assert await _used(db, coupon) == 1

    async def test_the_same_code_typed_differently_counts_as_the_same(self, db, platform_admin_client):
        order = await _order(db)
        _, coupon = await _coupon(db, max_uses=1)
        await _apply(platform_admin_client, order)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"coupon_code": " wc26 ", "discounts": []}
        )

        assert response.status_code == 200, response.text
        assert await _used(db, coupon) == 1

    async def test_a_coupon_that_ran_out_after_booking_does_not_block_a_re_save(
        self, db, platform_admin_client
    ):
        order = await _order(db)
        _, coupon = await _coupon(db)
        await _apply(platform_admin_client, order)
        coupon.max_uses = 1  # other orders have since taken it to its limit
        await db.flush()

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"coupon_code": "WC26", "discounts": []}
        )

        assert response.status_code == 200, response.text
        assert response.json()["discount"] == 2.0


class TestChangingTheCode:
    async def test_a_new_code_takes_its_use_and_returns_the_old_one(self, db, platform_admin_client):
        order = await _order(db)
        _, old = await _coupon(db, code="OLD10", max_uses=1, title="Old promo")
        _, new = await _coupon(db, code="NEW10", max_uses=1, title="New promo", value="25")
        await _apply(platform_admin_client, order, "OLD10")

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"coupon_code": "NEW10", "discounts": []}
        )

        assert response.status_code == 200, response.text
        assert response.json()["discount"] == 5.0
        assert (await _used(db, old), await _used(db, new)) == (0, 1)

    async def test_removing_the_code_returns_its_use_and_the_discount(self, db, platform_admin_client):
        order = await _order(db)
        _, coupon = await _coupon(db, max_uses=1)
        await _apply(platform_admin_client, order)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{order.id}", json={"coupon_code": None, "discounts": []}
        )

        assert response.status_code == 200, response.text
        assert response.json()["discount"] == 0
        assert await _used(db, coupon) == 0

    async def test_a_used_up_code_is_still_refused_on_a_different_order(self, db, platform_admin_client):
        holder, other = await _order(db), await _order(db)
        await _coupon(db, max_uses=1)
        await _apply(platform_admin_client, holder)

        response = await platform_admin_client.patch(
            f"{ORDERS}/{other.id}", json={"coupon_code": "WC26"}
        )

        assert response.status_code == 422
        assert "already been used" in response.json()["detail"]
