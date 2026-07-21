"""Add driver payment groups and one-group-per-driver assignments.

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-19 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "driver_payment_groups" not in tables:
        op.create_table(
            "driver_payment_groups",
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("rule_type", sa.String(length=24), nullable=False),
            sa.Column("fixed_amount", sa.Numeric(10, 2), nullable=True),
            sa.Column("delivery_fee_percentage", sa.Numeric(5, 2), nullable=True),
            sa.Column("platform_tip_percentage", sa.Numeric(5, 2), nullable=True),
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
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
    if "driver_payment_group_assignments" not in tables:
        op.create_table(
            "driver_payment_group_assignments",
            sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=False),
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
            sa.ForeignKeyConstraint(
                ["driver_id"], ["tenants.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["group_id"], ["driver_payment_groups.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("driver_id", name="uq_driver_payment_group_driver"),
        )
        op.create_index(
            "ix_driver_payment_group_assignments_group_id",
            "driver_payment_group_assignments",
            ["group_id"],
        )
        op.create_index(
            "ix_driver_payment_group_assignments_driver_id",
            "driver_payment_group_assignments",
            ["driver_id"],
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "driver_payment_group_assignments" in tables:
        op.drop_table("driver_payment_group_assignments")
    if "driver_payment_groups" in tables:
        op.drop_table("driver_payment_groups")
