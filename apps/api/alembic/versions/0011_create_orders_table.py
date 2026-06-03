"""Create orders table

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-23 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create OrderStatus enum
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE orderstatus_enum AS ENUM ('current', 'scheduled', 'completed', 'incomplete', 'history');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # Create orders table
    op.create_table(
        'orders',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('order_number', sa.String(), unique=True, nullable=False),
        sa.Column('pickup_name', sa.String(), nullable=True),
        sa.Column('pickup_phone', sa.String(), nullable=True),
        sa.Column('pickup_address', sa.String(), nullable=True),
        sa.Column('pickup_date', sa.String(), nullable=True),
        sa.Column('pickup_time', sa.String(), nullable=True),
        sa.Column('delivery_name', sa.String(), nullable=True),
        sa.Column('delivery_phone', sa.String(), nullable=True),
        sa.Column('delivery_email', sa.String(), nullable=True),
        sa.Column('delivery_address', sa.String(), nullable=True),
        sa.Column('delivery_date', sa.String(), nullable=True),
        sa.Column('delivery_time', sa.String(), nullable=True),
        sa.Column('items', postgresql.JSON(), nullable=True),
        sa.Column('subtotal', sa.Float(), default=0),
        sa.Column('tax_rate', sa.Float(), default=0),
        sa.Column('tax_amount', sa.Float(), default=0),
        sa.Column('delivery_fees', sa.Float(), default=0),
        sa.Column('delivery_tips', sa.Float(), default=0),
        sa.Column('discount', sa.Float(), default=0),
        sa.Column('total', sa.Float(), default=0),
        sa.Column('instructions', sa.String(), nullable=True),
        sa.Column('payment_method', sa.String(), nullable=True),
        sa.Column('payment_details', postgresql.JSON(), nullable=True),
        sa.Column('proof_of_delivery', postgresql.JSON(), nullable=True),
        sa.Column('status', postgresql.ENUM('current', 'scheduled', 'completed', 'incomplete', 'history', name='orderstatus_enum', create_type=False), default='current'),
        sa.Column('activity_status', postgresql.ENUM('driver_not_assigned', 'pickup_initiated', 'picked_up', 'delivery_initiated', 'delivery_in_progress', 'delivered', name='activitystatus_enum', create_type=False), default='driver_not_assigned'),
        sa.Column('ready_for_pickup', sa.Boolean(), default=False),
        sa.Column('order_placed_time', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('orders')
    op.execute("DROP TYPE IF EXISTS orderstatus_enum")

