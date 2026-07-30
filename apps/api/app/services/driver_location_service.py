"""
Driver location service — Redis-backed ephemeral position store.

Redis key
---------
    driver:location:{driver_id}

Value (JSON string)
-------------------
    {
        "lat": float,
        "lng": float,
        "updated_at": "<ISO-8601 UTC timestamp>"
    }
"""
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import redis.asyncio as aioredis

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KEY_PREFIX = "driver:location"

# Mobile app pushes every 5 minutes; TTL = 3× = 15 minutes.
LOCATION_PUSH_INTERVAL_SECONDS: int = 300   # 5 min
LOCATION_TTL_SECONDS: int = LOCATION_PUSH_INTERVAL_SECONDS * 3  # 15 min


# ---------------------------------------------------------------------------
# Domain types
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class DriverLocation:
    """Resolved location snapshot for a single driver."""
    driver_id: UUID
    lat: float
    lng: float
    updated_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _key(driver_id: UUID) -> str:
    return f"{KEY_PREFIX}:{driver_id}"


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class DriverLocationService:

    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis

    async def set(self, driver_id: UUID, lat: float, lng: float) -> None:
        payload = json.dumps(
            {
                "lat": lat,
                "lng": lng,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await self._redis.set(_key(driver_id), payload, ex=LOCATION_TTL_SECONDS)

    async def get(self, driver_id: UUID) -> DriverLocation | None:
        raw = await self._redis.get(_key(driver_id))
        if raw is None:
            return None
        data = json.loads(raw)
        return DriverLocation(
            driver_id=driver_id,
            lat=data["lat"],
            lng=data["lng"],
            updated_at=datetime.fromisoformat(data["updated_at"]),
        )

    async def delete(self, driver_id: UUID) -> None:
        await self._redis.delete(_key(driver_id))
