"""Orders a driver's outstanding stops into an efficient run.

Sequencing only — this never touches pricing or payout, which are locked when a
driver is assigned.
"""
import logging
import math
from dataclasses import dataclass
from typing import Literal

import httpx

from app.models.order import ActivityStatus, Order
from app.services.delivery_quote_service import DeliveryQuoteError, _api_key

logger = logging.getLogger(__name__)

ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = (
    "routes.optimizedIntermediateWaypointIndex,"
    "routes.legs.duration,"
    "routes.legs.distanceMeters,"
    "routes.distanceMeters,"
    "routes.duration"
)

#: Routes API ceiling on intermediate waypoints per request.
MAX_INTERMEDIATES = 25

#: Road networks run 20-40% longer than the straight line in a city; mirrors the
#: app's ROAD_FACTOR in `apps/driver-mobile/src/utils/distance.ts`.
ROAD_FACTOR = 1.3

EARTH_RADIUS_KM = 6371.0

#: Statuses whose outstanding stop is the pickup. Anything past these is carrying
#: the parcel, so the drop is what's left; `delivered` has no stop at all.
_PICKUP_PENDING = (ActivityStatus.driver_not_assigned, ActivityStatus.pickup_initiated)

StopKind = Literal["pickup", "drop"]
Engine = Literal["routes_api", "local"]


class RoutePlanError(Exception):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class Coords:
    latitude: float
    longitude: float


@dataclass
class Stop:
    order_id: str
    order_number: str | None
    kind: StopKind
    name: str | None
    address: str | None
    latitude: float
    longitude: float
    place_id: str | None
    leg_distance_meters: int | None = None
    leg_duration_seconds: int | None = None


@dataclass(frozen=True)
class Unplaceable:
    order_id: str
    order_number: str | None
    kind: StopKind
    address: str | None


@dataclass(frozen=True)
class RoutePlan:
    origin: Coords
    stops: list[Stop]
    unplaceable: list[Unplaceable]
    total_distance_meters: int | None
    total_duration_seconds: int | None
    optimized_by: Engine


# ---------------------------------------------------------------------------
# Stop derivation
# ---------------------------------------------------------------------------

def outstanding_stop(order: Order) -> tuple[StopKind, float | None, float | None, str | None, str | None, str | None] | None:
    """The one stop this order still needs, or None once it's delivered."""
    if order.activity_status == ActivityStatus.delivered:
        return None
    if order.activity_status in _PICKUP_PENDING:
        return (
            "pickup",
            order.pickup_latitude,
            order.pickup_longitude,
            order.pickup_place_id,
            order.pickup_address,
            order.pickup_name,
        )
    return (
        "drop",
        order.delivery_latitude,
        order.delivery_longitude,
        order.delivery_place_id,
        order.delivery_address,
        order.delivery_name,
    )


def derive_stops(orders: list[Order]) -> tuple[list[Stop], list[Unplaceable]]:
    """Split the driver's orders into routable stops and ones missing coordinates.

    Drops only appear for orders already picked up, so no stop depends on another
    and the ordering below needs no precedence handling.
    """
    stops: list[Stop] = []
    unplaceable: list[Unplaceable] = []

    for order in orders:
        resolved = outstanding_stop(order)
        if resolved is None:
            continue
        kind, lat, lng, place_id, address, name = resolved
        if lat is None or lng is None:
            unplaceable.append(
                Unplaceable(
                    order_id=str(order.id),
                    order_number=order.order_number,
                    kind=kind,
                    address=address,
                )
            )
            continue
        stops.append(
            Stop(
                order_id=str(order.id),
                order_number=order.order_number,
                kind=kind,
                name=name,
                address=address,
                latitude=float(lat),
                longitude=float(lng),
                place_id=place_id,
            )
        )

    return stops, unplaceable


# ---------------------------------------------------------------------------
# Local fallback ordering
# ---------------------------------------------------------------------------

def haversine_km(a: Coords, b: Coords) -> float:
    d_lat = math.radians(b.latitude - a.latitude)
    d_lng = math.radians(b.longitude - a.longitude)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a.latitude))
        * math.cos(math.radians(b.latitude))
        * math.sin(d_lng / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _coords(stop: Stop) -> Coords:
    return Coords(stop.latitude, stop.longitude)


def _path_length_km(origin: Coords, stops: list[Stop]) -> float:
    total = 0.0
    previous = origin
    for stop in stops:
        total += haversine_km(previous, _coords(stop))
        previous = _coords(stop)
    return total


def order_locally(origin: Coords, stops: list[Stop]) -> list[Stop]:
    """Nearest-neighbour seeded at the driver, then 2-opt until no improvement.

    Open route: the path is never closed back to the origin, so the last stop is
    free to be wherever the run ends.
    """
    if len(stops) < 3:
        return list(stops)

    remaining = list(stops)
    ordered: list[Stop] = []
    cursor = origin
    while remaining:
        nearest = min(remaining, key=lambda stop: haversine_km(cursor, _coords(stop)))
        remaining.remove(nearest)
        ordered.append(nearest)
        cursor = _coords(nearest)

    improved = True
    while improved:
        improved = False
        for i in range(len(ordered) - 1):
            for j in range(i + 1, len(ordered)):
                candidate = ordered[:i] + ordered[i : j + 1][::-1] + ordered[j + 1 :]
                if _path_length_km(origin, candidate) < _path_length_km(origin, ordered) - 1e-9:
                    ordered = candidate
                    improved = True

    return ordered


def _apply_local_legs(origin: Coords, stops: list[Stop]) -> tuple[int, int]:
    """Fill each stop's leg figures from padded straight-line distance.

    No traffic model here, so duration is a flat urban-average speed; callers
    surface `optimized_by` so the UI can say these are rough.
    """
    average_kmh = 30.0
    total_meters = 0
    total_seconds = 0
    previous = origin
    for stop in stops:
        km = haversine_km(previous, _coords(stop)) * ROAD_FACTOR
        stop.leg_distance_meters = int(km * 1000)
        stop.leg_duration_seconds = int(km / average_kmh * 3600)
        total_meters += stop.leg_distance_meters
        total_seconds += stop.leg_duration_seconds
        previous = _coords(stop)
    return total_meters, total_seconds


# ---------------------------------------------------------------------------
# Routes API ordering
# ---------------------------------------------------------------------------

def _waypoint(stop: Stop) -> dict:
    """Place ids pin the actual entrance; coordinates are the fallback."""
    if stop.place_id:
        return {"placeId": stop.place_id}
    return {"location": {"latLng": {"latitude": stop.latitude, "longitude": stop.longitude}}}


def _duration_seconds(value: str | None) -> int:
    return int(float(str(value or "0s").removesuffix("s") or 0))


async def _order_via_routes_api(
    client: httpx.AsyncClient, origin: Coords, stops: list[Stop]
) -> tuple[list[Stop], int, int]:
    """Ask Google to sequence the stops, and read the legs back off the answer.

    computeRoutes optimizes *between* a fixed origin and destination, but our run
    is open-ended, so the farthest stop is pinned as the destination — on a city
    run that is almost always where the driver genuinely ends up.
    """
    destination = max(stops, key=lambda stop: haversine_km(origin, _coords(stop)))
    intermediates = [stop for stop in stops if stop is not destination]

    response = await client.post(
        ROUTES_ENDPOINT,
        headers={"X-Goog-Api-Key": _api_key(), "X-Goog-FieldMask": FIELD_MASK},
        json={
            "origin": {
                "location": {
                    "latLng": {"latitude": origin.latitude, "longitude": origin.longitude}
                }
            },
            "destination": _waypoint(destination),
            "intermediates": [_waypoint(stop) for stop in intermediates],
            "travelMode": "DRIVE",
            # TRAFFIC_AWARE_OPTIMAL is rejected alongside waypoint optimization.
            "routingPreference": "TRAFFIC_AWARE",
            "optimizeWaypointOrder": True,
        },
    )
    if response.status_code != 200:
        raise RoutePlanError(
            f"Routes API returned {response.status_code}.", status_code=response.status_code
        )

    routes = response.json().get("routes") or []
    if not routes:
        raise RoutePlanError("No driving route was found between these stops.")
    route = routes[0]

    sequence = route.get("optimizedIntermediateWaypointIndex")
    if sequence is None:
        # Optimization silently unapplied; the given order would be meaningless.
        raise RoutePlanError("Routes API did not return an optimized order.")

    ordered = [intermediates[index] for index in sequence] + [destination]

    legs = route.get("legs") or []
    for stop, leg in zip(ordered, legs):
        stop.leg_distance_meters = int(leg.get("distanceMeters") or 0)
        stop.leg_duration_seconds = _duration_seconds(leg.get("duration"))

    return ordered, int(route.get("distanceMeters") or 0), _duration_seconds(route.get("duration"))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def build_route_plan(origin: Coords, orders: list[Order]) -> RoutePlan:
    """Order the driver's outstanding stops, best engine available."""
    stops, unplaceable = derive_stops(orders)

    if not stops:
        return RoutePlan(
            origin=origin,
            stops=[],
            unplaceable=unplaceable,
            total_distance_meters=0,
            total_duration_seconds=0,
            optimized_by="local",
        )

    # Under three stops there is nothing to optimize; over the API's ceiling it
    # refuses the request outright. Either way, spend nothing on the call.
    if 3 <= len(stops) <= MAX_INTERMEDIATES + 1:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(12.0)) as client:
                ordered, meters, seconds = await _order_via_routes_api(client, origin, stops)
            return RoutePlan(
                origin=origin,
                stops=ordered,
                unplaceable=unplaceable,
                total_distance_meters=meters,
                total_duration_seconds=seconds,
                optimized_by="routes_api",
            )
        except (RoutePlanError, DeliveryQuoteError, httpx.HTTPError, KeyError, IndexError) as exc:
            # A degraded order beats no route at all.
            logger.warning("Route optimization fell back to local ordering: %s", exc)

    ordered = order_locally(origin, stops)
    meters, seconds = _apply_local_legs(origin, ordered)
    return RoutePlan(
        origin=origin,
        stops=ordered,
        unplaceable=unplaceable,
        total_distance_meters=meters,
        total_duration_seconds=seconds,
        optimized_by="local",
    )
