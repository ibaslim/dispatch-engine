"""Drop driver_location_logs FKs to orders/tenants.

Write-behind telemetry: ids are captured at heartbeat time and inserted minutes
later, so a parent can be deleted inside that window. They are tags, not refs.

Revision ID: 0034
Revises: 0033
Create Date: 2026-08-20 12:00:00.000000
"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dropping on the hypertable parent propagates to every chunk.
    op.execute(sa.text("""
        ALTER TABLE driver_location_logs
            DROP CONSTRAINT IF EXISTS driver_location_logs_order_id_fkey,
            DROP CONSTRAINT IF EXISTS driver_location_logs_driver_id_fkey;
    """))


def downgrade() -> None:
    # Rows tagged with since-deleted parents would block the constraints.
    op.execute(sa.text("""
        UPDATE driver_location_logs AS l
           SET order_id = NULL
         WHERE l.order_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = l.order_id);
    """))
    op.execute(sa.text("""
        DELETE FROM driver_location_logs AS l
         WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = l.driver_id);
    """))
    op.create_foreign_key(
        "driver_location_logs_order_id_fkey",
        "driver_location_logs", "orders",
        ["order_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "driver_location_logs_driver_id_fkey",
        "driver_location_logs", "tenants",
        ["driver_id"], ["id"], ondelete="CASCADE",
    )
