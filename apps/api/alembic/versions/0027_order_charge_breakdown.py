"""Add persisted order charge breakdown.

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-18 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns("orders")}


def upgrade() -> None:
    columns = _columns()
    if "surcharge_ids" not in columns:
        op.add_column(
            "orders", sa.Column("surcharge_ids", sa.JSON(), server_default="[]", nullable=False)
        )
    if "applied_charges" not in columns:
        op.add_column(
            "orders", sa.Column("applied_charges", sa.JSON(), server_default="[]", nullable=False)
        )


def downgrade() -> None:
    columns = _columns()
    if "applied_charges" in columns:
        op.drop_column("orders", "applied_charges")
    if "surcharge_ids" in columns:
        op.drop_column("orders", "surcharge_ids")
