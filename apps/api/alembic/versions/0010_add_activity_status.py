"""Add activity_status column to orders table

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-21 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the activity status enum type
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE activitystatus_enum AS ENUM (
                'driver_not_assigned',
                'pickup_initiated',
                'picked_up',
                'delivery_initiated',
                'delivery_in_progress',
                'delivered'
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    
    conn = op.get_bind()
    orders_exists = conn.execute(
        sa.text("SELECT to_regclass('public.orders') IS NOT NULL")
    ).scalar()
    if orders_exists:
        existing_columns = {
            row[0]
            for row in conn.execute(
                sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='orders'"
                )
            )
        }
        if "activity_status" not in existing_columns:
            op.add_column(
                "orders",
                sa.Column(
                    "activity_status",
                    postgresql.ENUM(
                        "driver_not_assigned",
                        "pickup_initiated",
                        "picked_up",
                        "delivery_initiated",
                        "delivery_in_progress",
                        "delivered",
                        name="activitystatus_enum",
                        create_type=False,
                    ),
                    nullable=True,
                    server_default="driver_not_assigned",
                ),
            )


def downgrade() -> None:
    conn = op.get_bind()
    orders_exists = conn.execute(
        sa.text("SELECT to_regclass('public.orders') IS NOT NULL")
    ).scalar()
    if orders_exists:
        existing_columns = {
            row[0]
            for row in conn.execute(
                sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='orders'"
                )
            )
        }
        if "activity_status" in existing_columns:
            op.drop_column("orders", "activity_status")
    op.execute("DROP TYPE IF EXISTS activitystatus_enum")
