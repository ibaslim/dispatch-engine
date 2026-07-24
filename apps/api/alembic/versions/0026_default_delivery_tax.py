"""Add default delivery tax percentage.

Revision ID: 0026
Revises: 0025
Create Date: 2026-07-18 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if "default_tax_percentage" not in _columns("delivery_policies"):
        op.add_column(
            "delivery_policies",
            sa.Column(
                "default_tax_percentage",
                sa.Numeric(5, 2),
                server_default="0.00",
                nullable=False,
            ),
        )


def downgrade() -> None:
    if "default_tax_percentage" in _columns("delivery_policies"):
        op.drop_column("delivery_policies", "default_tax_percentage")
