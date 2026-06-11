"""Add driver payroll pricing hierarchy.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-11 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _common_columns() -> list[sa.Column]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())

    if "driver_pricing" not in existing_tables:
        op.create_table(
            "driver_pricing",
            sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("base_salary", sa.Float(), server_default="200", nullable=False),
            sa.Column("commission_per_delivery", sa.Float(), server_default="0", nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(["driver_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("driver_id"),
        )
        op.create_index(
            "ix_driver_pricing_driver_id",
            "driver_pricing",
            ["driver_id"],
            unique=True,
        )

    if "driver_state_pricing" not in existing_tables:
        op.create_table(
            "driver_state_pricing",
            sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("state_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("base_salary", sa.Float(), server_default="200", nullable=False),
            sa.Column("commission_per_delivery", sa.Float(), server_default="0", nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(["driver_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["state_id"], ["states.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("driver_id", "state_id", name="uq_driver_state_pricing"),
        )
        op.create_index(
            "ix_driver_state_pricing_driver_id",
            "driver_state_pricing",
            ["driver_id"],
        )
        op.create_index(
            "ix_driver_state_pricing_state_id",
            "driver_state_pricing",
            ["state_id"],
        )

    if "driver_city_pricing" not in existing_tables:
        op.create_table(
            "driver_city_pricing",
            sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("city_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("base_salary", sa.Float(), server_default="200", nullable=False),
            sa.Column("commission_per_delivery", sa.Float(), server_default="0", nullable=False),
            *_common_columns(),
            sa.ForeignKeyConstraint(["driver_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("driver_id", "city_id", name="uq_driver_city_pricing"),
        )
        op.create_index(
            "ix_driver_city_pricing_driver_id",
            "driver_city_pricing",
            ["driver_id"],
        )
        op.create_index(
            "ix_driver_city_pricing_city_id",
            "driver_city_pricing",
            ["city_id"],
        )


def downgrade() -> None:
    op.drop_table("driver_city_pricing")
    op.drop_table("driver_state_pricing")
    op.drop_table("driver_pricing")
