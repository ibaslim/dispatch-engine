"""Enforces driver_location_retention_days against driver_location_logs."""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

TABLE_NAME = "driver_location_logs"
# Bounded statements: one DELETE over the whole backlog would hold locks too long.
DELETE_BATCH_SIZE = 10_000
MAX_DELETE_BATCHES = 500


@dataclass(slots=True)
class RetentionResult:
    """What a purge removed; units differ per engine, so both are reported."""

    cutoff: datetime
    chunks_dropped: int = 0
    rows_deleted: int = 0
    skipped: bool = False


class DriverLocationRetentionService:

    def __init__(self, retention_days: int | None = None) -> None:
        self._retention_days = (
            settings.driver_location_retention_days if retention_days is None else retention_days
        )

    async def purge(self, db: AsyncSession) -> RetentionResult:
        """Removes telemetry older than the configured window."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=self._retention_days)

        # A zero or negative window would wipe the table; treat it as "disabled".
        if self._retention_days <= 0:
            logger.warning(
                "[LOCATION RETENTION] driver_location_retention_days=%s is not positive; purge skipped.",
                self._retention_days,
            )
            return RetentionResult(cutoff=cutoff, skipped=True)

        if await self._is_hypertable(db):
            chunks = await self._drop_chunks(db, cutoff)
            result = RetentionResult(cutoff=cutoff, chunks_dropped=chunks)
        else:
            rows = await self._delete_rows(db, cutoff)
            result = RetentionResult(cutoff=cutoff, rows_deleted=rows)

        if result.chunks_dropped or result.rows_deleted:
            logger.info(
                "[LOCATION RETENTION] Purged driver location logs older than %s (%d day(s)): "
                "%d chunk(s) dropped, %d row(s) deleted.",
                cutoff.isoformat(),
                self._retention_days,
                result.chunks_dropped,
                result.rows_deleted,
            )
        return result

    async def _is_hypertable(self, db: AsyncSession) -> bool:
        """timescaledb_information is only queryable once the extension exists."""
        extension = await db.execute(
            sa.text("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'")
        )
        if extension.scalar() is None:
            return False

        hypertable = await db.execute(
            sa.text(
                "SELECT 1 FROM timescaledb_information.hypertables "
                "WHERE hypertable_name::text = :name"
            ),
            {"name": TABLE_NAME},
        )
        return hypertable.scalar() is not None

    async def _drop_chunks(self, db: AsyncSession, cutoff: datetime) -> int:
        """Drops whole chunks, so data survives up to one chunk interval past the cutoff."""
        # regclass has no asyncpg codec: the name is inlined and the result cast to text.
        result = await db.execute(
            sa.text(
                f"SELECT drop_chunks('{TABLE_NAME}'::regclass, "
                "CAST(:cutoff AS timestamptz))::text"
            ),
            {"cutoff": cutoff},
        )
        dropped = len(result.scalars().all())
        await db.commit()
        return dropped

    async def _delete_rows(self, db: AsyncSession, cutoff: datetime) -> int:
        deleted = 0
        for _ in range(MAX_DELETE_BATCHES):
            # Keyed on the PK, not ctid: ctid repeats across hypertable chunks.
            result = await db.execute(
                sa.text(
                    f"DELETE FROM {TABLE_NAME} WHERE (recorded_at, driver_id) IN ("
                    "  SELECT recorded_at, driver_id"
                    f"   FROM {TABLE_NAME}"
                    "   WHERE recorded_at < CAST(:cutoff AS timestamptz)"
                    "   LIMIT :batch"
                    ")"
                ),
                {"cutoff": cutoff, "batch": DELETE_BATCH_SIZE},
            )
            await db.commit()
            batch = result.rowcount or 0
            deleted += batch
            if batch < DELETE_BATCH_SIZE:
                return deleted

        logger.warning(
            "[LOCATION RETENTION] Hit the %d-batch cap with rows still older than %s; "
            "the next run will continue.",
            MAX_DELETE_BATCHES,
            cutoff.isoformat(),
        )
        return deleted