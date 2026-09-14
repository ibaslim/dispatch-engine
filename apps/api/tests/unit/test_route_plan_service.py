"""Pure ordering logic behind the driver's multi-stop run.

Damage if these are wrong:
  derive_stops    -> a driver is sent to a pickup they already collected, or a
                     delivered order reappears on the run
  order_locally   -> the fallback sequence backtracks, costing fuel and time
  _order_via_routes_api -> Google's optimized order is applied to the wrong stops
"""
from types import SimpleNamespace

import pytest

from app.models.order import ActivityStatus
from app.services.route_plan_service import (
    Coords,
    Stop,
    _apply_local_legs,
    derive_stops,
    haversine_km,
    order_locally,
)

pytestmark = pytest.mark.unit


def make_order(activity_status, *, pickup=(49.28, -123.12), drop=(49.30, -123.10), number="ORD01"):
    """An Order stand-in carrying only the columns the service reads."""
    return SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        order_number=number,
        activity_status=activity_status,
        pickup_latitude=pickup[0] if pickup else None,
        pickup_longitude=pickup[1] if pickup else None,
        pickup_place_id="pickup-place",
        pickup_address="1 Pickup St",
        pickup_name="Sender",
        delivery_latitude=drop[0] if drop else None,
        delivery_longitude=drop[1] if drop else None,
        delivery_place_id="drop-place",
        delivery_address="2 Drop Ave",
        delivery_name="Recipient",
    )


def make_stop(name, lat, lng, kind="pickup", place_id=None):
    return Stop(
        order_id=name,
        order_number=name,
        kind=kind,
        name=name,
        address=name,
        latitude=lat,
        longitude=lng,
        place_id=place_id,
    )


class TestDeriveStops:
    @pytest.mark.parametrize(
        "activity_status,expected_kind",
        [
            (ActivityStatus.driver_not_assigned, "pickup"),
            (ActivityStatus.pickup_initiated, "pickup"),
            (ActivityStatus.picked_up, "drop"),
            (ActivityStatus.delivery_initiated, "drop"),
            (ActivityStatus.delivery_in_progress, "drop"),
        ],
    )
    def test_outstanding_stop_follows_the_activity_status(self, activity_status, expected_kind):
        stops, unplaceable = derive_stops([make_order(activity_status)])

        assert unplaceable == []
        assert len(stops) == 1
        assert stops[0].kind == expected_kind

    def test_delivered_orders_leave_the_run(self):
        stops, unplaceable = derive_stops([make_order(ActivityStatus.delivered)])

        assert stops == []
        assert unplaceable == []

    def test_a_picked_up_order_uses_the_delivery_coordinates(self):
        """The pickup is done, so routing back to it would send the driver backwards."""
        stops, _ = derive_stops([make_order(ActivityStatus.picked_up)])

        assert (stops[0].latitude, stops[0].longitude) == (49.30, -123.10)
        assert stops[0].place_id == "drop-place"

    def test_orders_without_coordinates_are_reported_not_dropped(self):
        """Silently omitting them would leave a job the driver never gets told about."""
        stops, unplaceable = derive_stops(
            [make_order(ActivityStatus.pickup_initiated, pickup=None)]
        )

        assert stops == []
        assert len(unplaceable) == 1
        assert unplaceable[0].kind == "pickup"
        assert unplaceable[0].address == "1 Pickup St"

    def test_no_precedence_is_needed_across_a_mixed_load(self):
        """Every order contributes exactly one stop, so stops never depend on each other."""
        stops, _ = derive_stops(
            [
                make_order(ActivityStatus.pickup_initiated, number="A"),
                make_order(ActivityStatus.picked_up, number="B"),
                make_order(ActivityStatus.delivered, number="C"),
            ]
        )

        assert [(s.order_number, s.kind) for s in stops] == [("A", "pickup"), ("B", "drop")]


class TestOrderLocally:
    def test_sequences_a_scrambled_line_of_stops(self):
        origin = Coords(49.2827, -123.1207)
        scrambled = [
            make_stop("D", 49.32, -123.12),
            make_stop("B", 49.30, -123.12),
            make_stop("A", 49.29, -123.12),
            make_stop("C", 49.31, -123.12),
        ]

        ordered = order_locally(origin, scrambled)

        assert [stop.order_id for stop in ordered] == ["A", "B", "C", "D"]

    def test_beats_the_input_order_on_a_backtracking_route(self):
        origin = Coords(49.28, -123.12)
        stops = [
            make_stop("far", 49.34, -123.12),
            make_stop("near", 49.29, -123.12),
            make_stop("mid", 49.31, -123.12),
        ]

        ordered = order_locally(origin, stops)

        def length(sequence):
            total, cursor = 0.0, origin
            for stop in sequence:
                total += haversine_km(cursor, Coords(stop.latitude, stop.longitude))
                cursor = Coords(stop.latitude, stop.longitude)
            return total

        assert length(ordered) < length(stops)

    def test_leaves_one_and_two_stop_runs_alone(self):
        """Nothing to optimize, and the API call would be wasted spend."""
        origin = Coords(49.28, -123.12)
        stops = [make_stop("A", 49.30, -123.12), make_stop("B", 49.29, -123.12)]

        assert order_locally(origin, stops) == stops

    def test_legs_are_filled_for_every_stop(self):
        origin = Coords(49.28, -123.12)
        stops = [make_stop("A", 49.29, -123.12), make_stop("B", 49.30, -123.12)]

        total_meters, total_seconds = _apply_local_legs(origin, stops)

        assert all(stop.leg_distance_meters is not None for stop in stops)
        assert all(stop.leg_duration_seconds is not None for stop in stops)
        assert total_meters == sum(stop.leg_distance_meters for stop in stops)
        assert total_seconds == sum(stop.leg_duration_seconds for stop in stops)


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeClient:
    """Stands in for httpx.AsyncClient, recording what was sent to Google."""

    def __init__(self, response):
        self.response = response
        self.sent = None

    def __call__(self, **_kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def post(self, _url, headers=None, json=None):
        self.sent = json
        return self.response


@pytest.fixture(autouse=True)
def api_key(monkeypatch):
    from app.services import route_plan_service

    monkeypatch.setattr(route_plan_service, "_api_key", lambda: "test-key")


ORIGIN = Coords(49.28, -123.12)

OPTIMIZED_ROUTE = {
    "routes": [
        {
            # Intermediates go up as [C, A, B]; this reorders them to A, B, C.
            "optimizedIntermediateWaypointIndex": [1, 2, 0],
            "legs": [
                {"distanceMeters": 1000, "duration": "120s"},
                {"distanceMeters": 1100, "duration": "130s"},
                {"distanceMeters": 1200, "duration": "140s"},
                {"distanceMeters": 3000, "duration": "400s"},
            ],
            "distanceMeters": 6300,
            "duration": "790s",
        }
    ]
}


def scrambled_stops():
    """Deliberately out of order; D is farthest from ORIGIN."""
    return [
        make_stop("C", 49.31, -123.12),
        make_stop("A", 49.29, -123.12),
        make_stop("B", 49.30, -123.12),
        make_stop("D", 49.34, -123.12),
    ]


class TestRoutesApiOrdering:
    async def test_applies_the_returned_waypoint_order(self):
        from app.services.route_plan_service import _order_via_routes_api

        client = FakeClient(FakeResponse(200, OPTIMIZED_ROUTE))

        ordered, meters, seconds = await _order_via_routes_api(client, ORIGIN, scrambled_stops())

        assert [stop.order_id for stop in ordered] == ["A", "B", "C", "D"]
        assert (meters, seconds) == (6300, 790)

    async def test_pins_the_farthest_stop_as_the_destination(self):
        """The run is open-ended, but computeRoutes demands a fixed destination."""
        from app.services.route_plan_service import _order_via_routes_api

        client = FakeClient(FakeResponse(200, OPTIMIZED_ROUTE))
        await _order_via_routes_api(client, ORIGIN, scrambled_stops())

        assert client.sent["destination"]["location"]["latLng"]["latitude"] == 49.34
        assert len(client.sent["intermediates"]) == 3

    async def test_sends_the_options_waypoint_optimization_requires(self):
        """TRAFFIC_AWARE_OPTIMAL is rejected alongside optimizeWaypointOrder."""
        from app.services.route_plan_service import _order_via_routes_api

        client = FakeClient(FakeResponse(200, OPTIMIZED_ROUTE))
        await _order_via_routes_api(client, ORIGIN, scrambled_stops())

        assert client.sent["optimizeWaypointOrder"] is True
        assert client.sent["routingPreference"] == "TRAFFIC_AWARE"
        assert not any(way.get("via") for way in client.sent["intermediates"])

    async def test_prefers_a_place_id_over_coordinates(self):
        from app.services.route_plan_service import _order_via_routes_api

        stops = scrambled_stops()
        stops[0].place_id = "ChIJ-test"
        client = FakeClient(FakeResponse(200, OPTIMIZED_ROUTE))

        await _order_via_routes_api(client, ORIGIN, stops)

        assert {"placeId": "ChIJ-test"} in client.sent["intermediates"]

    async def test_legs_land_on_the_reordered_stops(self):
        from app.services.route_plan_service import _order_via_routes_api

        client = FakeClient(FakeResponse(200, OPTIMIZED_ROUTE))

        ordered, _, _ = await _order_via_routes_api(client, ORIGIN, scrambled_stops())

        assert [stop.leg_duration_seconds for stop in ordered] == [120, 130, 140, 400]


class TestFallback:
    async def test_a_rejected_call_degrades_to_local_ordering(self, monkeypatch):
        """A degraded order beats handing the driver no route at all."""
        from app.services import route_plan_service

        monkeypatch.setattr(
            route_plan_service.httpx, "AsyncClient", FakeClient(FakeResponse(429))
        )
        orders = [
            make_order(ActivityStatus.pickup_initiated, pickup=(49.31, -123.12), number="C"),
            make_order(ActivityStatus.pickup_initiated, pickup=(49.29, -123.12), number="A"),
            make_order(ActivityStatus.pickup_initiated, pickup=(49.30, -123.12), number="B"),
        ]

        plan = await route_plan_service.build_route_plan(ORIGIN, orders)

        assert plan.optimized_by == "local"
        assert [stop.order_number for stop in plan.stops] == ["A", "B", "C"]
        assert plan.total_duration_seconds > 0

    async def test_an_empty_load_returns_an_empty_plan(self):
        from app.services.route_plan_service import build_route_plan

        plan = await build_route_plan(ORIGIN, [make_order(ActivityStatus.delivered)])

        assert plan.stops == []
        assert plan.total_distance_meters == 0
