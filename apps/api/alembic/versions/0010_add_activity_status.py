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
    
    # Add the activity_status column to orders table
    op.add_column(
        'orders',
        sa.Column('activity_status', postgresql.ENUM('driver_not_assigned', 'pickup_initiated', 'picked_up', 'delivery_initiated', 'delivery_in_progress', 'delivered', name='activitystatus_enum'), nullable=True, server_default='driver_not_assigned')
    )


def downgrade() -> None:
    op.drop_column('orders', 'activity_status')
    op.execute("DROP TYPE IF EXISTS activitystatus_enum")

