"""Drains per-driver location history from Redis into TimescaleDB.

A single bad record must never block the pipeline: data errors are isolated by
bisecting the batch and dead-lettering the offenders, and re-queues are capped
so nothing can be replayed forever.
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver_location_log import DriverLocationLog

logger = logging.getLogger(__name__)

HISTORY_PATTERN = "driver:location_history:*"
HISTORY_KEY_PREFIX = "driver:location_history"
LEGACY_BUFFER_KEY = "driver:location_logs:buffer"
LOCK_KEY = "driver:location_logs:flush_lock"
DEAD_LETTER_KEY = "driver:location_logs:dead"
LOCK_TTL_SECONDS = 30
MAX_ATTEMPTS = 3
DEAD_LETTER_MAX = 10_000
# 5 bind params per row; keep each statement well under asyncpg's 32767 limit.
INSERT_CHUNK_SIZE = 500


@dataclass(slots=True)
class _Record:
    """One parsed buffer entry, plus how many flushes it has already survived."""

    driver_id: UUID
    order_id: UUID | None
    lat: float
    lng: float
    recorded_at: datetime
    attempts: int = 0

    @classmethod
    def parse(cls, raw: bytes | str) -> "_Record":
        data = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else str(raw))
        return cls(
            driver_id=UUID(data["driver_id"]),
            order_id=UUID(data["order_id"]) if data.get("order_id") else None,
            lat=float(data["lat"]),
            lng=float(data["lng"]),
            recorded_at=datetime.fromisoformat(data["recorded_at"]),
            attempts=int(data.get("attempts", 0)),
        )

    @property
    def row(self) -> dict:
        return {
            "recorded_at": self.recorded_at,
            "driver_id": self.driver_id,
            "order_id": self.order_id,
            "lat": self.lat,
            "lng": self.lng,
        }

    def to_json(self, attempts: int | None = None) -> str:
        return json.dumps(
            {
                "driver_id": str(self.driver_id),
                "order_id": str(self.order_id) if self.order_id else None,
                "lat": self.lat,
                "lng": self.lng,
                "recorded_at": self.recorded_at.isoformat(),
                "attempts": self.attempts if attempts is None else attempts,
            }
        )


class DriverLocationFlushService:
    def __init__(self, redis: aioredis.Redis) -> None:
        self._redis = redis

    async def flush_buffer(self, db: AsyncSession) -> int:
        """Drains driver:location_history:* into Postgres. Returns rows inserted."""
        acquired = await self._redis.set(LOCK_KEY, "locked", nx=True, ex=LOCK_TTL_SECONDS)
        if not acquired:
            logger.debug("Flush lock already held by another worker; skipping flush attempt.")
            return 0

        try:
            raw_items = await self._drain()
            if not raw_items:
                return 0

            records: list[_Record] = []
            malformed: list[bytes | str] = []
            for raw in raw_items:
                try:
                    records.append(_Record.parse(raw))
                except Exception as parse_err:
                    logger.error("Malformed driver location log entry (%s): %s", parse_err, raw)
                    malformed.append(raw)

            if malformed:
                await self._dead_letter_raw(malformed, "malformed")
            if not records:
                return 0

            inserted = await self._insert(db, records)
            if inserted:
                logger.info(
                    "[LOCATION FLUSH] Flushed %d of %d buffered driver location log(s).",
                    inserted,
                    len(records),
                )
            return inserted
        finally:
            await self._redis.delete(LOCK_KEY)

    # --- Redis ---------------------------------------------------------------

    async def _drain(self) -> list[bytes | str]:
        keys = []
        async for key in self._redis.scan_iter(match=HISTORY_PATTERN):
            keys.append(key.decode("utf-8") if isinstance(key, bytes) else str(key))

        if await self._redis.exists(LEGACY_BUFFER_KEY):
            keys.append(LEGACY_BUFFER_KEY)

        raw_items: list[bytes | str] = []
        for key in keys:
            pipe = self._redis.pipeline()
            pipe.lrange(key, 0, -1)
            pipe.delete(key)
            res = await pipe.execute()
            if res[0]:
                raw_items.extend(res[0])
        return raw_items

    async def _requeue(self, records: list[_Record], reason: str) -> None:
        """Puts records back for the next tick; dead-letters ones out of attempts."""
        exhausted: list[_Record] = []
        pipe = self._redis.pipeline()
        for record in records:
            attempts = record.attempts + 1
            if attempts >= MAX_ATTEMPTS:
                exhausted.append(record)
                continue
            pipe.rpush(f"{HISTORY_KEY_PREFIX}:{record.driver_id}", record.to_json(attempts))
        await pipe.execute()

        if exhausted:
            logger.error(
                "Dead-lettering %d location log(s) after %d failed flush attempts: %s",
                len(exhausted),
                MAX_ATTEMPTS,
                reason,
            )
            await self._dead_letter(exhausted, f"max attempts exceeded: {reason}")

    async def _dead_letter(self, records: list[_Record], reason: str) -> None:
        await self._dead_letter_raw([r.to_json() for r in records], reason)

    async def _dead_letter_raw(self, items: list[bytes | str], reason: str) -> None:
        failed_at = datetime.now(timezone.utc).isoformat()
        pipe = self._redis.pipeline()
        for item in items:
            payload = item.decode("utf-8", "replace") if isinstance(item, bytes) else str(item)
            pipe.rpush(
                DEAD_LETTER_KEY,
                json.dumps({"reason": reason, "failed_at": failed_at, "record": payload}),
            )
        pipe.ltrim(DEAD_LETTER_KEY, -DEAD_LETTER_MAX, -1)
        await pipe.execute()

    # --- Postgres ------------------------------------------------------------

    async def _insert_batch(self, db: AsyncSession, records: list[_Record]) -> int:
        # Duplicates are expected: a re-queued record may already have landed.
        stmt = pg_insert(DriverLocationLog).values([r.row for r in records]).on_conflict_do_nothing()
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount or 0

    async def _insert(self, db: AsyncSession, records: list[_Record]) -> int:
        inserted = 0
        for start in range(0, len(records), INSERT_CHUNK_SIZE):
            inserted += await self._insert_chunk(db, records[start:start + INSERT_CHUNK_SIZE])
        return inserted

    async def _insert_chunk(self, db: AsyncSession, records: list[_Record]) -> int:
        try:
            return await self._insert_batch(db, records)
        except (IntegrityError, DataError) as exc:
            await db.rollback()
            logger.warning("Batch rejected (%s); isolating bad records.", exc.__class__.__name__)
            return await self._insert_isolated(db, records)
        except Exception as exc:
            await db.rollback()
            logger.error("Location flush failed (non-data error); re-queueing. Error: %s", exc)
            await self._requeue(records, str(exc))
            return 0

    async def _insert_isolated(self, db: AsyncSession, records: list[_Record]) -> int:
        """Bisects a rejected batch so only the offending rows are discarded."""
        if len(records) == 1:
            try:
                return await self._insert_batch(db, records)
            except (IntegrityError, DataError) as exc:
                await db.rollback()
                logger.error("Discarding unstorable location log %s: %s", records[0].row, exc.orig or exc)
                await self._dead_letter(records, str(exc.orig or exc))
                return 0
            except Exception as exc:
                await db.rollback()
                await self._requeue(records, str(exc))
                return 0

        mid = len(records) // 2
        left = await self._insert_isolated(db, records[:mid])
        right = await self._insert_isolated(db, records[mid:])
        return left + right
