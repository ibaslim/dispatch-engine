"""Add driver_id to orders table

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-23 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add driver_id column to orders table
    op.add_column(
        'orders',
        sa.Column('driver_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_orders_driver_id',
        'orders',
        'tenants',
        ['driver_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Add index for faster lookups
    op.create_index(
        'ix_orders_driver_id',
        'orders',
        ['driver_id']
    )


def downgrade() -> None:
    op.drop_index('ix_orders_driver_id', table_name='orders')
    op.drop_constraint('fk_orders_driver_id', 'orders', type_='foreignkey')
    op.drop_column('orders', 'driver_id')

