"""Hand driver_location_logs retention to driver_location_retention_days.

Migration 0031 pinned a 30-day Timescale retention policy. That policy would
silently cap any configured window longer than 30 days, so it is removed and
the purge_driver_location_logs task becomes the single authority.

Revision ID: 0035
Revises: 0034
Create Date: 2026-08-25 12:00:00.000000
"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM remove_retention_policy('driver_location_logs', if_exists => TRUE);
            END IF;
        END $$;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM add_retention_policy(
                    'driver_location_logs',
                    INTERVAL '30 days',
                    if_not_exists => TRUE
                );
            END IF;
        END $$;
    """))