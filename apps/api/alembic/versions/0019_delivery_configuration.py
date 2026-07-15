"""Add delivery configuration tables.

Revision ID: 0019
Revises: b657187fa30d
Create Date: 2026-07-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: Union[str, None] = "b657187fa30d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _common_columns() -> list[sa.Column]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # Development starts the app with metadata.create_all(), so these tables may
    # already exist before Alembic records this revision. Keep the migration safe
    # for both those databases and clean deployments.
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())

    if "operational_zones" not in existing_tables:
        op.create_table(
            "operational_zones",
            sa.Column("name", sa.String(length=100), nullable=False),
            *_common_columns(),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
    if "delivery_categories" not in existing_tables:
        op.create_table(
            "delivery_categories",
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("description", sa.String(length=240), nullable=False),
            *_common_columns(),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
    if "after_hours_deliveries" not in existing_tables:
        op.create_table(
            "after_hours_deliveries",
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("extra_amount", sa.Numeric(10, 2), nullable=False),
            *_common_columns(),
            sa.PrimaryKeyConstraint("id"),
        )
    if "surcharges" not in existing_tables:
        op.create_table(
            "surcharges",
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("extra_amount", sa.Numeric(10, 2), nullable=False),
            *_common_columns(),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
    if "special_occasions" not in existing_tables:
        op.create_table(
            "special_occasions",
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("occasion_date", sa.Date(), nullable=False),
            sa.Column(
                "repeats_annually",
                sa.Boolean(),
                server_default=sa.false(),
                nullable=False,
            ),
            *_common_columns(),
            sa.PrimaryKeyConstraint("id"),
        )
    if "operational_zone_cities" not in existing_tables:
        op.create_table(
            "operational_zone_cities",
            sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("city_id", postgresql.UUID(as_uuid=True), nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["zone_id"], ["operational_zones.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("city_id", name="uq_operational_zone_city"),
        )
        op.create_index(
            "ix_operational_zone_cities_city_id",
            "operational_zone_cities",
            ["city_id"],
        )
        op.create_index(
            "ix_operational_zone_cities_zone_id",
            "operational_zone_cities",
            ["zone_id"],
        )
    if "zone_base_prices" not in existing_tables:
        op.create_table(
            "zone_base_prices",
            sa.Column("zone_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("individual_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("partner_price", sa.Numeric(10, 2), nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(
                ["zone_id"], ["operational_zones.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("zone_id"),
        )
        op.create_index(
            "ix_zone_base_prices_zone_id",
            "zone_base_prices",
            ["zone_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_table("zone_base_prices")
    op.drop_table("operational_zone_cities")
    op.drop_table("special_occasions")
    op.drop_table("surcharges")
    op.drop_table("after_hours_deliveries")
    op.drop_table("delivery_categories")
    op.drop_table("operational_zones")
