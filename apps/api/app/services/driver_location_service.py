"""
Driver location service — Redis-backed live position store & per-driver position history.

Redis live key
--------------
    driver:location:{driver_id}

Redis per-driver history key
----------------------------
    driver:location_history:{driver_id}
"""
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import redis.asyncio as aioredis
from app.core.config import settings

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KEY_PREFIX = "driver:location"
HISTORY_KEY_PREFIX = "driver:location_history"


def get_location_ttl_seconds() -> int:
    """Live location TTL; also the presence window, since offers scan this key."""
    return settings.driver_presence_window_seconds


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


def _history_key(driver_id: UUID) -> str:
    return f"{HISTORY_KEY_PREFIX}:{driver_id}"


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
        await self._redis.set(_key(driver_id), payload, ex=get_location_ttl_seconds())

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

    async def push_to_history(
        self,
        driver_id: UUID,
        lat: float,
        lng: float,
        order_id: UUID | None = None,
    ) -> int:
        """
        Appends historical location log entry to per-driver Redis list:
        driver:location_history:{driver_id}
        """
        record = json.dumps(
            {
                "driver_id": str(driver_id),
                "order_id": str(order_id) if order_id else None,
                "lat": lat,
                "lng": lng,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        key = _history_key(driver_id)
        max_records = settings.driver_location_history_max_records
        pipe = self._redis.pipeline()
        pipe.rpush(key, record)
        # Keep only the newest entries: a stalled flusher must not grow unbounded.
        pipe.ltrim(key, -max_records, -1)
        pipe.llen(key)
        res = await pipe.execute()
        return res[-1]
