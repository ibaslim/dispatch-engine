"""Add tenant role field

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE tenant_role_enum AS ENUM ('vendor', 'driver', 'individual');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.add_column("tenants", sa.Column("role", postgresql.ENUM("vendor", "driver", "individual", name="tenant_role_enum"), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "role")
    op.execute("DROP TYPE tenant_role_enum;")

