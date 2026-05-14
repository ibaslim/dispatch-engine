"""Add username field to tenants table

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("username", sa.String(length=100), nullable=True))
    op.create_index("ix_tenants_username", "tenants", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tenants_username", table_name="tenants")
    op.drop_column("tenants", "username")

