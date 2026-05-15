"""Add proof_of_delivery column to orders

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-15 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('proof_of_delivery', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'proof_of_delivery')

