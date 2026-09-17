"""Store order pickup/delivery schedules as planned timestamps.

pickup_date/pickup_time (and delivery) were free-form strings with the time
required. Only the date is required now, so each stop becomes a naive
wall-clock timestamp plus a flag saying whether a time was actually given;
date-only stops are stored at 00:00.

Revision ID: 0038
Revises: 0037
Create Date: 2026-09-15 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STOPS = ("pickup", "delivery")


def upgrade() -> None:
    for stop in STOPS:
        op.add_column("orders", sa.Column(f"{stop}_planned_at", sa.DateTime(timezone=False), nullable=True))
        op.add_column(
            "orders",
            sa.Column(f"{stop}_time_specified", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )
        # Text-to-timestamp cast keeps the wall-clock value as entered; no timezone is applied.
        op.execute(
            f"""
            UPDATE orders SET
                {stop}_time_specified = NULLIF({stop}_time, '') IS NOT NULL,
                {stop}_planned_at = (
                    COALESCE(NULLIF({stop}_date, ''), to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
                    || ' ' || COALESCE(NULLIF({stop}_time, ''), '00:00')
                )::timestamp
            """
        )
        op.alter_column("orders", f"{stop}_planned_at", nullable=False)
        op.create_check_constraint(
            f"ck_orders_{stop}_date_only_midnight",
            "orders",
            f"{stop}_time_specified OR {stop}_planned_at::time = '00:00'",
        )
        op.drop_column("orders", f"{stop}_date")
        op.drop_column("orders", f"{stop}_time")


def downgrade() -> None:
    for stop in STOPS:
        op.add_column("orders", sa.Column(f"{stop}_date", sa.String(), nullable=True))
        op.add_column("orders", sa.Column(f"{stop}_time", sa.String(), nullable=True))
        op.execute(
            f"""
            UPDATE orders SET
                {stop}_date = to_char({stop}_planned_at, 'YYYY-MM-DD'),
                {stop}_time = CASE WHEN {stop}_time_specified THEN to_char({stop}_planned_at, 'HH24:MI') END
            """
        )
        op.drop_constraint(f"ck_orders_{stop}_date_only_midnight", "orders", type_="check")
        op.drop_column("orders", f"{stop}_time_specified")
        op.drop_column("orders", f"{stop}_planned_at")
