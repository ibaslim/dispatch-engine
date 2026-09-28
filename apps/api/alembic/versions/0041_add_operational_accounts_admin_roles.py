"""Add operational_admin and accounts_admin roles

Revision ID: 0041
Revises: 0040
Create Date: 2026-09-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0041"
down_revision: Union[str, None] = "0040"
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
                WHERE pg_type.typname = 'role_enum' AND pg_enum.enumlabel = 'operational_admin'
            ) THEN
                ALTER TYPE role_enum ADD VALUE 'operational_admin';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
                WHERE pg_type.typname = 'role_enum' AND pg_enum.enumlabel = 'accounts_admin'
            ) THEN
                ALTER TYPE role_enum ADD VALUE 'accounts_admin';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # Removing enum values is not supported safely; leave as-is.
    pass
