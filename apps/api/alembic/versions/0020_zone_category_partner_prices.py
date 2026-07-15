"""Add category-based zone prices and partner overrides.

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _common_columns() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "zone_category_prices" not in existing_tables:
        op.create_table(
            "zone_category_prices",
            sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("individual_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("partner_price", sa.Numeric(10, 2), nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(
                ["category_id"], ["delivery_categories.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["zone_id"], ["operational_zones.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "zone_id", "category_id", name="uq_zone_category_price"
            ),
        )
        op.create_index(
            "ix_zone_category_prices_zone_id",
            "zone_category_prices",
            ["zone_id"],
        )
        op.create_index(
            "ix_zone_category_prices_category_id",
            "zone_category_prices",
            ["category_id"],
        )
    if "partner_zone_category_prices" not in existing_tables:
        op.create_table(
            "partner_zone_category_prices",
            sa.Column(
                "zone_category_price_id",
                postgresql.UUID(as_uuid=True),
                nullable=False,
            ),
            sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("price", sa.Numeric(10, 2), nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(
                ["partner_id"], ["tenants.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["zone_category_price_id"],
                ["zone_category_prices.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "zone_category_price_id",
                "partner_id",
                name="uq_partner_zone_category_price",
            ),
        )
        op.create_index(
            "ix_partner_zone_category_prices_partner_id",
            "partner_zone_category_prices",
            ["partner_id"],
        )
        op.create_index(
            "ix_partner_zone_category_prices_zone_category_price_id",
            "partner_zone_category_prices",
            ["zone_category_price_id"],
        )


def downgrade() -> None:
    op.drop_table("partner_zone_category_prices")
    op.drop_table("zone_category_prices")
