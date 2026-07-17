"""Add incident report data to orders.

Revision ID: 0023
Revises: 0022
Create Date: 2026-07-16 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns("orders")}


def upgrade() -> None:
    if "incident_report" not in _columns():
        op.add_column("orders", sa.Column("incident_report", sa.JSON(), nullable=True))


def downgrade() -> None:
    if "incident_report" in _columns():
        op.drop_column("orders", "incident_report")
