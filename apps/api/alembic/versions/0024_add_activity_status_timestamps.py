"""Add activity status checkpoint timestamps to orders.

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-17 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TIMESTAMP_COLUMNS = [
    "pickup_initiated_at",
    "picked_up_at",
    "delivery_initiated_at",
    "delivery_in_progress_at",
    "delivered_at",
]


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns("orders")}


def upgrade() -> None:
    existing = _columns()
    for column_name in TIMESTAMP_COLUMNS:
        if column_name not in existing:
            op.add_column(
                "orders",
                sa.Column(column_name, sa.DateTime(timezone=True), nullable=True),
            )


def downgrade() -> None:
    existing = _columns()
    for column_name in TIMESTAMP_COLUMNS:
        if column_name in existing:
            op.drop_column("orders", column_name)