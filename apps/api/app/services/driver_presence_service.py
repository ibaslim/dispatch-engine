"""
Who is on shift, for push notification targeting.
"""
import logging
from uuid import UUID

import redis.asyncio as aioredis

from app.services.driver_location_service import (
    KEY_PREFIX as LOCATION_KEY_PREFIX,
    get_location_ttl_seconds,
)

logger = logging.getLogger(__name__)

_SCAN_COUNT = 500

# Below this, brief GPS/network gaps drop working drivers out of the offer pool.
MIN_SANE_PRESENCE_WINDOW_SECONDS = 90


def assert_presence_window_sane() -> None:
    """Warn if location tuning has quietly broken push targeting.

    Warning, not a hard failure: a bad window degrades push, and refusing to
    boot over it would be the worse outage.
    """
    window = get_location_ttl_seconds()
    if window < MIN_SANE_PRESENCE_WINDOW_SECONDS:
        logger.warning(
            "Driver presence window is %ss, below the %ss floor. Push offer targeting "
            "derives from the location key, so drivers may drop out of the offer pool "
            "during brief GPS or network gaps. Raise driver_location_push_interval_seconds.",
            window,
            MIN_SANE_PRESENCE_WINDOW_SECONDS,
        )


class DriverPresenceService:
    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis

    async def is_online(self, driver_id: UUID | str) -> bool:
        return bool(await self._redis.exists(f"{LOCATION_KEY_PREFIX}:{driver_id}"))

    async def list_online_driver_ids(self) -> list[UUID]:
        # SCAN, not KEYS: this runs on every order publish and KEYS blocks Redis.
        driver_ids: list[UUID] = []
        async for key in self._redis.scan_iter(
            match=f"{LOCATION_KEY_PREFIX}:*", count=_SCAN_COUNT
        ):
            raw = key if isinstance(key, str) else key.decode()
            try:
                driver_ids.append(UUID(raw.rsplit(":", 1)[-1]))
            except ValueError:
                # One stray key must not stop a whole fan-out.
                logger.warning("Skipping malformed driver location key: %s", key)
        return driver_ids