"""Tests for GET /api/v1/orders/route-plan.

Damage if these break:
  access     -> a non-driver reads a driver's whole day of stops
  scoping    -> another driver's jobs appear on this driver's run
  stop set   -> a delivered order reappears, or a picked-up order sends the
                driver back to the pickup
  degrading  -> a Google outage removes the feature instead of falling back
"""
import pytest

from app.models.order import ActivityStatus
from app.services import route_plan_service
from tests.factories import OrderFactory
from tests.utils import API

pytestmark = pytest.mark.integration

ROUTE_PLAN = f"{API}/orders/route-plan"

# Roughly downtown Vancouver; the exact values only matter relative to each other.
ORIGIN = {"latitude": 49.28, "longitude": -123.12}


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, response):
        self.response = response

    def __call__(self, **_kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def post(self, _url, headers=None, json=None):
        return self.response


@pytest.fixture(autouse=True)
def offline_routes_api(monkeypatch):
    """No test may reach Google. Default to a refusal, so the local path runs."""
    monkeypatch.setattr(route_plan_service, "_api_key", lambda: "test-key")
    monkeypatch.setattr(
        route_plan_service.httpx, "AsyncClient", FakeClient(FakeResponse(429))
    )


async def make_stop_order(db, driver_tenant, *, activity_status, pickup, drop, number):
    return await OrderFactory.create(
        db,
        driver=driver_tenant,
        activity_status=activity_status,
        order_number=number,
        pickup_latitude=pickup[0],
        pickup_longitude=pickup[1],
        delivery_latitude=drop[0],
        delivery_longitude=drop[1],
    )


class TestAccess:
    async def test_a_vendor_cannot_read_a_route_plan(self, tenant_admin_client):
        response = await tenant_admin_client.get(ROUTE_PLAN, params=ORIGIN)

        assert response.status_code == 403

    async def test_a_driver_without_a_position_is_told_why(self, driver_client):
        """Redis holds no fix in tests, so the caller must supply one."""
        response = await driver_client.get(ROUTE_PLAN)

        assert response.status_code == 422


class TestStopSet:
    async def test_orders_up_the_driver_s_outstanding_stops(
        self, db, driver_client, driver_tenant
    ):
        await make_stop_order(
            db,
            driver_tenant,
            activity_status=ActivityStatus.pickup_initiated,
            pickup=(49.31, -123.12),
            drop=(49.40, -123.12),
            number="ORD-C",
        )
        await make_stop_order(
            db,
            driver_tenant,
            activity_status=ActivityStatus.pickup_initiated,
            pickup=(49.29, -123.12),
            drop=(49.40, -123.12),
            number="ORD-A",
        )
        await make_stop_order(
            db,
            driver_tenant,
            activity_status=ActivityStatus.pickup_initiated,
            pickup=(49.30, -123.12),
            drop=(49.40, -123.12),
            number="ORD-B",
        )

        response = await driver_client.get(ROUTE_PLAN, params=ORIGIN)

        assert response.status_code == 200
        body = response.json()
        assert [stop["order_number"] for stop in body["stops"]] == ["ORD-A", "ORD-B", "ORD-C"]
        assert [stop["sequence"] for stop in body["stops"]] == [1, 2, 3]
        assert all(stop["kind"] == "pickup" for stop in body["stops"])

    async def test_a_picked_up_order_routes_to_its_drop(self, db, driver_client, driver_tenant):
        await make_stop_order(
            db,
            driver_tenant,
            activity_status=ActivityStatus.picked_up,
            pickup=(49.29, -123.12),
            drop=(49.33, -123.12),
            number="ORD-P",
        )

        body = (await driver_client.get(ROUTE_PLAN, params=ORIGIN)).json()

        assert [(s["kind"], s["latitude"]) for s in body["stops"]] == [("drop", 49.33)]

    async def test_delivered_orders_are_not_routed(self, db, driver_client, driver_tenant):
        await make_stop_order(
            db,
            driver_tenant,
            activity_status=ActivityStatus.delivered,
            pickup=(49.29, -123.12),
            drop=(49.33, -123.12),
            number="ORD-D",
        )

        body = (await driver_client.get(ROUTE_PLAN, params=ORIGIN)).json()

        assert body["stops"] == []

    async def test_another_drivers_orders_stay_out_of_the_run(
        self, db, driver_client, driver_tenant, other_tenant
    ):
        await make_stop_order(
            db,
            other_tenant,
            activity_status=ActivityStatus.pickup_initiated,
            pickup=(49.29, -123.12),
            drop=(49.33, -123.12),
            number="ORD-OTHER",
        )

        body = (await driver_client.get(ROUTE_PLAN, params=ORIGIN)).json()

        assert body["stops"] == []

    async def test_an_order_without_coordinates_is_reported_not_hidden(
        self, db, driver_client, driver_tenant
    ):
        await OrderFactory.create(
            db,
            driver=driver_tenant,
            activity_status=ActivityStatus.pickup_initiated,
            order_number="ORD-NOGEO",
        )

        body = (await driver_client.get(ROUTE_PLAN, params=ORIGIN)).json()

        assert body["stops"] == []
        assert [item["order_number"] for item in body["unplaceable"]] == ["ORD-NOGEO"]


class TestDegrading:
    async def test_a_google_refusal_still_returns_a_route(
        self, db, driver_client, driver_tenant
    ):
        """Quota exhaustion must cost route quality, not the feature."""
        for index, number in enumerate(["ORD-1", "ORD-2", "ORD-3"]):
            await make_stop_order(
                db,
                driver_tenant,
                activity_status=ActivityStatus.pickup_initiated,
                pickup=(49.29 + index * 0.01, -123.12),
                drop=(49.40, -123.12),
                number=number,
            )

        response = await driver_client.get(ROUTE_PLAN, params=ORIGIN)

        assert response.status_code == 200
        body = response.json()
        assert body["optimized_by"] == "local"
        assert len(body["stops"]) == 3
        assert body["total_duration_seconds"] > 0
