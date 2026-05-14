"""Add vendor and individual roles

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-13 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
                WHERE pg_type.typname = 'role_enum' AND pg_enum.enumlabel = 'vendor'
            ) THEN
                ALTER TYPE role_enum ADD VALUE 'vendor';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
                WHERE pg_type.typname = 'role_enum' AND pg_enum.enumlabel = 'individual'
            ) THEN
                ALTER TYPE role_enum ADD VALUE 'individual';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # Removing enum values is not supported safely; leave as-is.
    pass

