"""Holds the Google-derived part of a delivery quote so saving reuses what the admin saw."""
import json
from dataclasses import asdict
from uuid import uuid4

import redis.asyncio as aioredis

from app.services.delivery_quote_service import PlaceDetails, RouteFacts

QUOTE_LOCK_TTL_SECONDS = 15 * 60
_KEY = "delivery_quote_lock:{}"


async def store_route_facts(
    redis: aioredis.Redis, pickup_place_id: str, delivery_place_id: str, facts: RouteFacts
) -> str:
    quote_id = uuid4().hex
    payload = {"pickup_place_id": pickup_place_id, "delivery_place_id": delivery_place_id, **asdict(facts)}
    await redis.set(_KEY.format(quote_id), json.dumps(payload), ex=QUOTE_LOCK_TTL_SECONDS)
    return quote_id


async def load_route_facts(
    redis: aioredis.Redis, quote_id: str, pickup_place_id: str, delivery_place_id: str
) -> RouteFacts | None:
    """None when the lock expired or was issued for a different address pair."""
    raw = await redis.get(_KEY.format(quote_id))
    if raw is None:
        return None
    data = json.loads(raw)
    if (data["pickup_place_id"], data["delivery_place_id"]) != (pickup_place_id, delivery_place_id):
        return None
    return RouteFacts(
        pickup_place=PlaceDetails(**data["pickup_place"]),
        delivery_place=PlaceDetails(**data["delivery_place"]),
        distance_meters=data["distance_meters"],
        duration_seconds=data["duration_seconds"],
    )


async def remaining_seconds(redis: aioredis.Redis, quote_id: str) -> int:
    return max(await redis.ttl(_KEY.format(quote_id)), 0)
