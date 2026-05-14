"""Add onboarding applications table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-11 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STATUS_ENUM = postgresql.ENUM(
    "pending",
    "approved",
    "rejected",
    name="onboarding_status_enum",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE onboarding_status_enum AS ENUM ('pending', 'approved', 'rejected');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.create_table(
        "onboarding_applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            postgresql.ENUM(name="role_enum", create_type=False),
            nullable=False,
        ),
        sa.Column("status", STATUS_ENUM, nullable=False, server_default="pending"),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "reviewed_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("decision_reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_onboarding_applications_user_id",
        "onboarding_applications",
        ["user_id"],
    )
    op.create_index(
        "ix_onboarding_applications_status",
        "onboarding_applications",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_onboarding_applications_status", table_name="onboarding_applications")
    op.drop_index("ix_onboarding_applications_user_id", table_name="onboarding_applications")
    op.drop_table("onboarding_applications")
