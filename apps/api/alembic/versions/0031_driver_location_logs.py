"""Create driver_location_logs table and Timescale hypertable.

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-30 12:00:00.000000
"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    has_table = inspector.has_table("driver_location_logs")

    if not has_table:
        # 1. Create table
        op.create_table(
            "driver_location_logs",
            sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("lat", sa.Float(), nullable=False),
            sa.Column("lng", sa.Float(), nullable=False),
            sa.ForeignKeyConstraint(["driver_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("driver_id", "recorded_at"),
        )

        # 2. Create indexes
        op.create_index(
            "driver_location_logs_driver_time_idx",
            "driver_location_logs",
            ["driver_id", sa.text("recorded_at DESC")],
        )
        op.create_index(
            "driver_location_logs_order_time_idx",
            "driver_location_logs",
            ["order_id", sa.text("recorded_at DESC")],
        )

    # 3. Enable TimescaleDB extension and convert table to hypertable if TimescaleDB extension is available
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable(
                    'driver_location_logs',
                    'recorded_at',
                    chunk_time_interval => INTERVAL '1 day',
                    if_not_exists => TRUE
                );
                PERFORM add_retention_policy(
                    'driver_location_logs',
                    INTERVAL '30 days',
                    if_not_exists => TRUE
                );
            END IF;
        END $$;
    """))


def downgrade() -> None:
    op.drop_index("driver_location_logs_order_time_idx", table_name="driver_location_logs")
    op.drop_index("driver_location_logs_driver_time_idx", table_name="driver_location_logs")
    op.drop_table("driver_location_logs")
