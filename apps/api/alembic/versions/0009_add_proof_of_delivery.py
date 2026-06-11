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
    conn = op.get_bind()
    orders_exists = conn.execute(
        sa.text("SELECT to_regclass('public.orders') IS NOT NULL")
    ).scalar()
    if orders_exists:
        existing_columns = {
            row[0]
            for row in conn.execute(
                sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='orders'"
                )
            )
        }
        if "proof_of_delivery" not in existing_columns:
            op.add_column(
                "orders",
                sa.Column("proof_of_delivery", sa.JSON(), nullable=True),
            )


def downgrade() -> None:
    conn = op.get_bind()
    orders_exists = conn.execute(
        sa.text("SELECT to_regclass('public.orders') IS NOT NULL")
    ).scalar()
    if orders_exists:
        existing_columns = {
            row[0]
            for row in conn.execute(
                sa.text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='orders'"
                )
            )
        }
        if "proof_of_delivery" in existing_columns:
            op.drop_column("orders", "proof_of_delivery")
