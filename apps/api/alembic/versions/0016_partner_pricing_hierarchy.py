"""Add national and partner-specific pricing hierarchy.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-10 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _common_columns() -> list[sa.Column]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "global_pricing",
        sa.Column("key", sa.String(length=20), nullable=False),
        sa.Column("partner_price_per_km", sa.Float(), server_default="2", nullable=False),
        sa.Column("partner_price_per_kg", sa.Float(), server_default="2", nullable=False),
        sa.Column("individual_price_per_km", sa.Float(), server_default="2", nullable=False),
        sa.Column("individual_price_per_kg", sa.Float(), server_default="2", nullable=False),
        *_common_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_table(
        "partner_pricing",
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("price_per_km", sa.Float(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        *_common_columns(),
        sa.ForeignKeyConstraint(["partner_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("partner_id"),
    )
    op.create_index("ix_partner_pricing_partner_id", "partner_pricing", ["partner_id"], unique=True)
    op.create_table(
        "partner_state_pricing",
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("price_per_km", sa.Float(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        *_common_columns(),
        sa.ForeignKeyConstraint(["partner_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["state_id"], ["states.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("partner_id", "state_id", name="uq_partner_state_pricing"),
    )
    op.create_index("ix_partner_state_pricing_partner_id", "partner_state_pricing", ["partner_id"])
    op.create_index("ix_partner_state_pricing_state_id", "partner_state_pricing", ["state_id"])
    op.create_table(
        "partner_city_pricing",
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("city_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("price_per_km", sa.Float(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        *_common_columns(),
        sa.ForeignKeyConstraint(["partner_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("partner_id", "city_id", name="uq_partner_city_pricing"),
    )
    op.create_index("ix_partner_city_pricing_partner_id", "partner_city_pricing", ["partner_id"])
    op.create_index("ix_partner_city_pricing_city_id", "partner_city_pricing", ["city_id"])


def downgrade() -> None:
    op.drop_table("partner_city_pricing")
    op.drop_table("partner_state_pricing")
    op.drop_table("partner_pricing")
    op.drop_table("global_pricing")
