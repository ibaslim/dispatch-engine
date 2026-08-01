import logging
from uuid import UUID
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.order import ActivityStatus, Order

logger = logging.getLogger(__name__)

KEY_PREFIX = "driver:active_order"
NONE_MARKER = "__none__"


def _key(driver_id: UUID) -> str:
    return f"{KEY_PREFIX}:{driver_id}"


class DriverActiveOrderService:
    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis

    async def get_active_order_id(
        self, driver_id: UUID, db: AsyncSession
    ) -> UUID | None:
        """
        Resolves active order ID for driver.
        Reads from Redis cache first. If missing, queries DB and populates cache.
        """
        redis_key = _key(driver_id)
        raw_val = await self._redis.get(redis_key)

        if raw_val is not None:
            val = raw_val.decode("utf-8") if isinstance(raw_val, bytes) else str(raw_val)
            if val == NONE_MARKER:
                return None
            try:
                return UUID(val)
            except ValueError:
                logger.warning("Invalid UUID found in active order cache key %s: %s", redis_key, val)

        # Fallback to DB
        stmt = (
            select(Order.id)
            .where(
                Order.driver_id == driver_id,
                Order.activity_status == ActivityStatus.delivery_in_progress,
            )
            .limit(1)
        )
        res = await db.execute(stmt)
        active_order_id = res.scalar_one_or_none()

        if active_order_id is not None:
            await self._redis.set(redis_key, str(active_order_id))
            return active_order_id
        else:
            ttl = settings.driver_location_active_order_negative_cache_seconds
            await self._redis.set(redis_key, NONE_MARKER, ex=ttl)
            return None

    async def set_active_order(self, driver_id: UUID, order_id: UUID) -> None:
        """
        Sets driver's active order cache immediately when order enters delivery_in_progress.
        """
        redis_key = _key(driver_id)
        await self._redis.set(redis_key, str(order_id))

    async def clear_active_order(self, driver_id: UUID, order_id: UUID) -> None:
        """
        Clears driver active order cache if it currently matches order_id.
        Prevents race conditions where one order deletes another order's cache.
        """
        redis_key = _key(driver_id)
        raw_val = await self._redis.get(redis_key)
        if raw_val is not None:
            val = raw_val.decode("utf-8") if isinstance(raw_val, bytes) else str(raw_val)
            if val == str(order_id):
                await self._redis.delete(redis_key)
