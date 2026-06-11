"""Add province/state pricing defaults.

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-10 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_tables = {
        row[0]
        for row in conn.execute(sa.text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        ))
    }

    if "state_pricing" not in existing_tables:
        op.create_table(
            "state_pricing",
            sa.Column("state_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("partner_price_per_km", sa.Float(), server_default="2", nullable=False),
            sa.Column("partner_price_per_kg", sa.Float(), server_default="2", nullable=False),
            sa.Column("individual_price_per_km", sa.Float(), server_default="2", nullable=False),
            sa.Column("individual_price_per_kg", sa.Float(), server_default="2", nullable=False),
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["state_id"], ["states.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("state_id"),
        )
        op.create_index("ix_state_pricing_state_id", "state_pricing", ["state_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_state_pricing_state_id", table_name="state_pricing")
    op.drop_table("state_pricing")
