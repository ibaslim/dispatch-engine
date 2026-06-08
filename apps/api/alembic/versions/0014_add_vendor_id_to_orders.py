"""Add vendor_id to orders

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-08 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_cols = {
        row[0]
        for row in conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='orders'"
            )
        )
    }

    if "vendor_id" not in existing_cols:
        op.add_column(
            "orders",
            sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True)
        )
        op.create_foreign_key(
            "fk_orders_vendor_id",
            "orders",
            "tenants",
            ["vendor_id"],
            ["id"],
            ondelete="SET NULL"
        )


def downgrade() -> None:
    op.drop_constraint("fk_orders_vendor_id", "orders", type_="foreignkey")
    op.drop_column("orders", "vendor_id")
