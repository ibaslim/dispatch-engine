import json
import logging
from datetime import datetime
from uuid import UUID
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver_location_log import DriverLocationLog

logger = logging.getLogger(__name__)

HISTORY_PATTERN = "driver:location_history:*"
LEGACY_BUFFER_KEY = "driver:location_logs:buffer"
LOCK_KEY = "driver:location_logs:flush_lock"
LOCK_TTL_SECONDS = 30


class DriverLocationFlushService:
    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis

    async def flush_buffer(self, db: AsyncSession) -> int:
        """
        Scans per-driver location history lists in Redis (driver:location_history:*),
        drains accumulated records, and bulk inserts them into TimescaleDB/Postgres.
        Returns the number of records successfully flushed.
        """
        # 1. Acquire Redis lock
        acquired = await self._redis.set(LOCK_KEY, "locked", nx=True, ex=LOCK_TTL_SECONDS)
        if not acquired:
            logger.debug("Flush lock already held by another worker; skipping flush attempt.")
            return 0

        try:
            # 2. Collect all keys matching driver:location_history:* plus legacy buffer key
            history_keys = []
            async for key in self._redis.scan_iter(match=HISTORY_PATTERN):
                history_keys.append(key.decode("utf-8") if isinstance(key, bytes) else str(key))

            if await self._redis.exists(LEGACY_BUFFER_KEY):
                history_keys.append(LEGACY_BUFFER_KEY)

            if not history_keys:
                return 0

            # 3. Drain records from all per-driver history keys
            raw_items = []
            for key in history_keys:
                pipe = self._redis.pipeline()
                pipe.lrange(key, 0, -1)
                pipe.delete(key)
                res = await pipe.execute()

                items = res[0]
                if items:
                    raw_items.extend(items)

            if not raw_items:
                return 0

            # 4. Parse JSON records
            logs_to_insert: list[DriverLocationLog] = []
            malformed_items: list[bytes | str] = []

            for raw in raw_items:
                try:
                    str_data = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
                    data = json.loads(str_data)

                    recorded_at_dt = datetime.fromisoformat(data["recorded_at"])
                    driver_uuid = UUID(data["driver_id"])
                    order_uuid = UUID(data["order_id"]) if data.get("order_id") else None
                    lat_val = float(data["lat"])
                    lng_val = float(data["lng"])

                    logs_to_insert.append(
                        DriverLocationLog(
                            recorded_at=recorded_at_dt,
                            driver_id=driver_uuid,
                            order_id=order_uuid,
                            lat=lat_val,
                            lng=lng_val,
                        )
                    )
                except Exception as parse_err:
                    logger.error("Skipping malformed driver location log entry (%s): %s", parse_err, raw)
                    malformed_items.append(raw)

            if not logs_to_insert:
                return 0

            # 5. Bulk insert into DB
            try:
                db.add_all(logs_to_insert)
                await db.commit()
                msg = f"[LOCATION FLUSH] Successfully flushed {len(logs_to_insert)} driver location log(s) from per-driver Redis keys to Postgres."
                logger.info(msg)
                return len(logs_to_insert)
            except Exception as db_err:
                await db.rollback()
                logger.error("Failed to commit location logs to DB; re-queueing records to Redis. Error: %s", db_err)
                # Re-queue valid un-committed items
                for log in logs_to_insert:
                    rec = json.dumps({
                        "driver_id": str(log.driver_id),
                        "order_id": str(log.order_id) if log.order_id else None,
                        "lat": log.lat,
                        "lng": log.lng,
                        "recorded_at": log.recorded_at.isoformat(),
                    })
                    await self._redis.rpush(f"driver:location_history:{log.driver_id}", rec)
                raise db_err

        finally:
            # 6. Release lock
            await self._redis.delete(LOCK_KEY)
