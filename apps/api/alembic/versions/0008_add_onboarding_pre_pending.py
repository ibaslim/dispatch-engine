"""Add pre_pending onboarding status

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-14 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE onboarding_status_enum ADD VALUE IF NOT EXISTS 'pre_pending'")


def downgrade() -> None:
    # Enum value removal is not supported in PostgreSQL without recreation.
    pass

