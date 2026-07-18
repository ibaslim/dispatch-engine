"""Add a configurable percentage to each special occasion.

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-18 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> set[str]:
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("special_occasions")
    }


def upgrade() -> None:
    if "extra_percentage" not in _columns():
        op.add_column(
            "special_occasions",
            sa.Column(
                "extra_percentage",
                sa.Numeric(5, 2),
                server_default="0.00",
                nullable=False,
            ),
        )


def downgrade() -> None:
    if "extra_percentage" in _columns():
        op.drop_column("special_occasions", "extra_percentage")
