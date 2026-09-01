"""Tests for /api/v1/configurations (delivery configuration).

All 27 routes are platform-admin only. Damage if these break:
  RBAC        -> a tenant user reads or rewrites global pricing / zones / policy
  zones       -> a city lands in two operational zones, or a zone with no cities
  base prices -> a partner override attaches to a non-partner tenant
  validation  -> duplicate names, empty zones, or equal after-hours bounds slip through

The bulk value here is the RBAC matrix: one parametrized guard test per route catches a
route that forgot its `PlatformAdmin` dependency. Auth is resolved before body validation,
so an empty body still yields 401/403 (verified before writing this file).
"""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.delivery_configuration import (
    AfterHoursDelivery,
    DeliveryCategory,
    DeliveryPolicy,
    OperationalZone,
    Surcharge,
)
from app.models.location import City, Country, State
from app.models.tenant import TenantRole
from tests.factories import TenantFactory
from tests.utils import API

pytestmark = pytest.mark.integration

CFG = f"{API}/configurations"

_ID = str(uuid.uuid4())  # stable placeholder id for path-param routes in the RBAC matrix

# (method, path) for every route in the router.
ROUTES = [
    ("get", "/delivery-policy"),
    ("put", "/delivery-policy"),
    ("get", "/operational-zones"),
    ("post", "/operational-zones"),
    ("put", f"/operational-zones/{_ID}"),
    ("delete", f"/operational-zones/{_ID}"),
    ("get", "/delivery-categories"),
    ("post", "/delivery-categories"),
    ("put", f"/delivery-categories/{_ID}"),
    ("delete", f"/delivery-categories/{_ID}"),
    ("get", "/after-hours"),
    ("post", "/after-hours"),
    ("put", f"/after-hours/{_ID}"),
    ("delete", f"/after-hours/{_ID}"),
    ("get", "/base-prices"),
    ("put", f"/base-prices/{_ID}/{_ID}"),
    ("put", f"/base-prices/zones/{_ID}/radius"),
    ("put", f"/base-prices/{_ID}/partner-overrides/{_ID}"),
    ("delete", f"/base-prices/{_ID}/partner-overrides/{_ID}"),
    ("get", "/surcharges"),
    ("post", "/surcharges"),
    ("put", f"/surcharges/{_ID}"),
    ("delete", f"/surcharges/{_ID}"),
    ("get", "/special-occasions"),
    ("post", "/special-occasions"),
    ("put", f"/special-occasions/{_ID}"),
    ("delete", f"/special-occasions/{_ID}"),
]


def _call(http_client, method: str, path: str):
    # httpx's get/delete convenience methods take no body; only send json for body methods.
    kwargs = {"json": {}} if method in ("post", "put", "patch") else {}
    return getattr(http_client, method)(f"{CFG}{path}", **kwargs)


class TestConfigRBAC:
    @pytest.mark.parametrize("method, path", ROUTES)
    async def test_rejects_a_tenant_admin(self, tenant_admin_client, method, path):
        response = await _call(tenant_admin_client, method, path)

        assert response.status_code == 403, f"{method.upper()} {path} not platform-admin gated"

    @pytest.mark.parametrize("method, path", ROUTES)
    async def test_requires_authentication(self, client, method, path):
        response = await _call(client, method, path)

        assert response.status_code == 401, f"{method.upper()} {path} allows anonymous access"


# --------------------------------------------------------------------------- #
# Delivery policy
# --------------------------------------------------------------------------- #


class TestDeliveryPolicy:
    async def test_returns_defaults_when_unset(self, platform_admin_client):
        response = await platform_admin_client.get(f"{CFG}/delivery-policy")

        assert response.status_code == 200
        assert response.json()["allow_intercity"] is False

    async def test_update_persists_the_policy(self, platform_admin_client):
        response = await platform_admin_client.put(
            f"{CFG}/delivery-policy",
            json={"allow_intercity": True, "default_tax_percentage": "13.00"},
        )
        assert response.status_code == 200

        reread = await platform_admin_client.get(f"{CFG}/delivery-policy")
        assert reread.json()["allow_intercity"] is True
        assert Decimal(str(reread.json()["default_tax_percentage"])) == Decimal("13.00")


# --------------------------------------------------------------------------- #
# Delivery categories
# --------------------------------------------------------------------------- #


class TestDeliveryCategories:
    async def test_create_then_list(self, db, platform_admin_client):
        create = await platform_admin_client.post(
            f"{CFG}/delivery-categories", json={"name": "Fragile", "description": "Handle with care"}
        )
        assert create.status_code == 201
        assert create.json()["name"] == "Fragile"

        listing = await platform_admin_client.get(f"{CFG}/delivery-categories")
        assert "Fragile" in [c["name"] for c in listing.json()]

    async def test_rejects_a_duplicate_name(self, db, platform_admin_client):
        db.add(DeliveryCategory(name="Standard", description="x"))
        await db.flush()

        response = await platform_admin_client.post(
            f"{CFG}/delivery-categories", json={"name": "standard", "description": "dup"}
        )

        assert response.status_code == 409

    async def test_update_changes_the_name(self, db, platform_admin_client):
        item = DeliveryCategory(name="Old", description="x")
        db.add(item)
        await db.flush()

        response = await platform_admin_client.put(
            f"{CFG}/delivery-categories/{item.id}",
            json={"name": "New", "description": "y"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "New"

    async def test_delete_removes_it(self, db, platform_admin_client):
        item = DeliveryCategory(name="Gone", description="x")
        db.add(item)
        await db.flush()

        response = await platform_admin_client.delete(f"{CFG}/delivery-categories/{item.id}")

        assert response.status_code == 204
        assert await db.get(DeliveryCategory, item.id) is None

    async def test_update_unknown_returns_404(self, platform_admin_client):
        response = await platform_admin_client.put(
            f"{CFG}/delivery-categories/{uuid.uuid4()}",
            json={"name": "X", "description": "y"},
        )

        assert response.status_code == 404


# --------------------------------------------------------------------------- #
# After-hours ranges
# --------------------------------------------------------------------------- #


class TestAfterHours:
    async def test_create_a_range(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{CFG}/after-hours",
            json={"start_time": "22:00:00", "end_time": "06:00:00", "extra_amount": "7.50"},
        )

        assert response.status_code == 201
        assert Decimal(str(response.json()["extra_amount"])) == Decimal("7.50")

    async def test_rejects_equal_start_and_end(self, platform_admin_client):
        response = await platform_admin_client.post(
            f"{CFG}/after-hours",
            json={"start_time": "09:00:00", "end_time": "09:00:00", "extra_amount": "1.00"},
        )

        assert response.status_code == 422

    async def test_delete_removes_it(self, db, platform_admin_client):
        from datetime import time

        item = AfterHoursDelivery(start_time=time(22, 0), end_time=time(6, 0), extra_amount=Decimal("5.00"))
        db.add(item)
        await db.flush()

        response = await platform_admin_client.delete(f"{CFG}/after-hours/{item.id}")

        assert response.status_code == 204
        assert await db.get(AfterHoursDelivery, item.id) is None


# --------------------------------------------------------------------------- #
# Surcharges
# --------------------------------------------------------------------------- #


class TestSurcharges:
    async def test_create_then_update(self, db, platform_admin_client):
        create = await platform_admin_client.post(
            f"{CFG}/surcharges", json={"name": "Rush", "extra_amount": "3.00"}
        )
        assert create.status_code == 201
        surcharge_id = create.json()["id"]

        update = await platform_admin_client.put(
            f"{CFG}/surcharges/{surcharge_id}", json={"name": "Rush", "extra_amount": "4.00"}
        )
        assert update.status_code == 200
        assert Decimal(str(update.json()["extra_amount"])) == Decimal("4.00")

    async def test_rejects_a_duplicate_name(self, db, platform_admin_client):
        db.add(Surcharge(name="Weekend", extra_amount=Decimal("2.00")))
        await db.flush()

        response = await platform_admin_client.post(
            f"{CFG}/surcharges", json={"name": "weekend", "extra_amount": "2.00"}
        )

        assert response.status_code == 409

    async def test_delete_unknown_returns_404(self, platform_admin_client):
        response = await platform_admin_client.delete(f"{CFG}/surcharges/{uuid.uuid4()}")

        assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Special occasions
# --------------------------------------------------------------------------- #


class TestSpecialOccasions:
    async def test_create_then_list(self, platform_admin_client):
        create = await platform_admin_client.post(
            f"{CFG}/special-occasions",
            json={
                "name": "Christmas",
                "occasion_date": "2026-12-25",
                "repeats_annually": True,
                "extra_percentage": "20.00",
            },
        )
        assert create.status_code == 201

        listing = await platform_admin_client.get(f"{CFG}/special-occasions")
        assert "Christmas" in [o["name"] for o in listing.json()]

    async def test_delete_removes_it(self, db, platform_admin_client):
        create = await platform_admin_client.post(
            f"{CFG}/special-occasions",
            json={
                "name": "Boxing Day",
                "occasion_date": "2026-12-26",
                "repeats_annually": False,
                "extra_percentage": "10.00",
            },
        )
        occasion_id = create.json()["id"]

        response = await platform_admin_client.delete(f"{CFG}/special-occasions/{occasion_id}")

        assert response.status_code == 204


# --------------------------------------------------------------------------- #
# Operational zones + base prices (need real cities)
# --------------------------------------------------------------------------- #


@pytest.fixture
async def cities(db):
    """Two real cities in one province, so zone assignment has something to bind to."""
    country = Country(name="Canada", code="CA")
    db.add(country)
    await db.flush()
    state = State(name="Ontario", country_id=country.id)
    db.add(state)
    await db.flush()
    toronto = City(name="Toronto", state_id=state.id)
    ottawa = City(name="Ottawa", state_id=state.id)
    db.add_all([toronto, ottawa])
    await db.flush()
    return {"toronto": toronto, "ottawa": ottawa}


class TestOperationalZones:
    async def test_create_a_zone_with_cities(self, platform_admin_client, cities):
        response = await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "Downtown", "city_ids": [str(cities["toronto"].id)]},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Downtown"
        assert [c["name"] for c in body["cities"]] == ["Toronto"]

    async def test_rejects_a_duplicate_zone_name(self, db, platform_admin_client, cities):
        db.add(OperationalZone(name="Central"))
        await db.flush()

        response = await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "central", "city_ids": [str(cities["toronto"].id)]},
        )

        assert response.status_code == 409

    async def test_rejects_a_city_already_in_another_zone(self, platform_admin_client, cities):
        await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "Zone A", "city_ids": [str(cities["toronto"].id)]},
        )

        response = await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "Zone B", "city_ids": [str(cities["toronto"].id)]},
        )

        assert response.status_code == 409

    async def test_rejects_an_unknown_city(self, platform_admin_client, cities):
        response = await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "Ghost Zone", "city_ids": [str(uuid.uuid4())]},
        )

        assert response.status_code == 400

    async def test_delete_a_zone(self, db, platform_admin_client, cities):
        create = await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "Temp Zone", "city_ids": [str(cities["ottawa"].id)]},
        )
        zone_id = create.json()["id"]

        response = await platform_admin_client.delete(f"{CFG}/operational-zones/{zone_id}")

        assert response.status_code == 204
        assert await db.get(OperationalZone, uuid.UUID(zone_id)) is None


class TestBasePrices:
    async def _zone_and_category(self, client, cities):
        zone = await client.post(
            f"{CFG}/operational-zones",
            json={"name": "Price Zone", "city_ids": [str(cities["toronto"].id)]},
        )
        category = await client.post(
            f"{CFG}/delivery-categories", json={"name": "Bulk", "description": "large items"}
        )
        return zone.json()["id"], category.json()["id"]

    async def test_upsert_a_base_price(self, platform_admin_client, cities):
        zone_id, category_id = await self._zone_and_category(platform_admin_client, cities)

        response = await platform_admin_client.put(
            f"{CFG}/base-prices/{zone_id}/{category_id}",
            json={
                "individual_price": "10.00",
                "partner_price": "8.00",
                "individual_out_of_radius_per_km": "1.50",
                "partner_out_of_radius_per_km": "1.00",
            },
        )

        assert response.status_code == 200
        assert Decimal(str(response.json()["individual_price"])) == Decimal("10.00")

    async def test_upsert_rejects_an_unknown_zone(self, platform_admin_client, cities):
        _, category_id = await self._zone_and_category(platform_admin_client, cities)

        response = await platform_admin_client.put(
            f"{CFG}/base-prices/{uuid.uuid4()}/{category_id}",
            json={
                "individual_price": "10.00",
                "partner_price": "8.00",
                "individual_out_of_radius_per_km": "1.50",
                "partner_out_of_radius_per_km": "1.00",
            },
        )

        assert response.status_code == 404

    async def test_partner_override_rejects_a_non_vendor_tenant(
        self, db, platform_admin_client, cities, driver_tenant
    ):
        zone_id, category_id = await self._zone_and_category(platform_admin_client, cities)
        base_price = await platform_admin_client.put(
            f"{CFG}/base-prices/{zone_id}/{category_id}",
            json={
                "individual_price": "10.00",
                "partner_price": "8.00",
                "individual_out_of_radius_per_km": "1.50",
                "partner_out_of_radius_per_km": "1.00",
            },
        )
        base_price_id = base_price.json()["id"]

        # driver_tenant is role=driver, not a vendor/partner.
        response = await platform_admin_client.put(
            f"{CFG}/base-prices/{base_price_id}/partner-overrides/{driver_tenant.id}",
            json={"price": "7.00", "out_of_radius_per_km": "0.90"},
        )

        assert response.status_code == 404

    async def test_partner_override_for_a_vendor(self, db, platform_admin_client, cities):
        zone_id, category_id = await self._zone_and_category(platform_admin_client, cities)
        base_price = await platform_admin_client.put(
            f"{CFG}/base-prices/{zone_id}/{category_id}",
            json={
                "individual_price": "10.00",
                "partner_price": "8.00",
                "individual_out_of_radius_per_km": "1.50",
                "partner_out_of_radius_per_km": "1.00",
            },
        )
        base_price_id = base_price.json()["id"]
        partner = await TenantFactory.create(db, name="Partner Co", role=TenantRole.vendor)

        response = await platform_admin_client.put(
            f"{CFG}/base-prices/{base_price_id}/partner-overrides/{partner.id}",
            json={"price": "6.00", "out_of_radius_per_km": "0.80"},
        )

        assert response.status_code == 200
        assert response.json()["partner_id"] == str(partner.id)

    async def test_update_zone_radius(self, platform_admin_client, cities):
        zone = await platform_admin_client.post(
            f"{CFG}/operational-zones",
            json={"name": "Radius Zone", "city_ids": [str(cities["ottawa"].id)]},
        )
        zone_id = zone.json()["id"]

        response = await platform_admin_client.put(
            f"{CFG}/base-prices/zones/{zone_id}/radius", json={"radius_km": "12.50"}
        )

        assert response.status_code == 200
        assert Decimal(str(response.json()["radius_km"])) == Decimal("12.50")
