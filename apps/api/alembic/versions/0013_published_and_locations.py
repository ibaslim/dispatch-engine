"""Add published fields to orders; ensure location/pricing tables exist

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-08 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. orders: published + published_at ────────────────────────────────────
    # Add columns only if they don't exist yet (idempotent for existing DBs)
    existing_cols = {
        row[0]
        for row in conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='orders'"
            )
        )
    }

    if "published" not in existing_cols:
        op.add_column(
            "orders",
            sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if "published_at" not in existing_cols:
        op.add_column(
            "orders",
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ── 2. Location tables (countries / states / cities / city_pricing) ────────
    # These may have been created by init_db's create_all; use CREATE TABLE IF NOT EXISTS.
    existing_tables = {
        row[0]
        for row in conn.execute(
            sa.text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            )
        )
    }

    if "countries" not in existing_tables:
        op.create_table(
            "countries",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("code", sa.String(length=10), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code"),
            sa.UniqueConstraint("name"),
        )

    if "states" not in existing_tables:
        op.create_table(
            "states",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name", sa.String(length=150), nullable=False),
            sa.Column("country_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["country_id"], ["countries.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name", "country_id", name="uq_state_country"),
        )
        op.create_index("ix_states_country_id", "states", ["country_id"])

    if "cities" not in existing_tables:
        op.create_table(
            "cities",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name", sa.String(length=150), nullable=False),
            sa.Column("state_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["state_id"], ["states.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name", "state_id", name="uq_city_state"),
        )
        op.create_index("ix_cities_state_id", "cities", ["state_id"])

    if "city_pricing" not in existing_tables:
        op.create_table(
            "city_pricing",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("city_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("partner_price_per_km", sa.Float(), nullable=True),
            sa.Column("partner_price_per_kg", sa.Float(), nullable=True),
            sa.Column("individual_price_per_km", sa.Float(), nullable=True),
            sa.Column("individual_price_per_kg", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("city_id"),
        )
        op.create_index("ix_city_pricing_city_id", "city_pricing", ["city_id"], unique=True)


def downgrade() -> None:
    # Drop location tables in reverse dependency order
    op.drop_table("city_pricing")
    op.drop_table("cities")
    op.drop_table("states")
    op.drop_table("countries")

    op.drop_column("orders", "published_at")
    op.drop_column("orders", "published")
