import uuid
from datetime import datetime
from sqlalchemy import DateTime, Float, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DriverLocationLog(Base):
    """Append-only driver telemetry; retention is driver_location_retention_days.

    driver_id/order_id are tags, not foreign keys — see migration 0034.
    """

    __tablename__ = "driver_location_logs"
    __table_args__ = (
        Index("driver_location_logs_driver_time_idx", "driver_id", "recorded_at"),
        Index("driver_location_logs_order_time_idx", "order_id", "recorded_at"),
    )

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
        nullable=False,
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        nullable=False,
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
