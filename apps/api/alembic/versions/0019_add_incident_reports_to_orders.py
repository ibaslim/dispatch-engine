"""add incident_report column to orders

Revision ID: 0019
Revises: b657187fa30d
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0019'
down_revision: Union[str, None] = 'b657187fa30d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('incident_report', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'incident_report')