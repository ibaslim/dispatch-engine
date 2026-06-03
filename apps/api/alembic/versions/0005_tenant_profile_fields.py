"""Add tenant profile fields

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("contact_name", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("contact_email", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("contact_phone_country_code", sa.String(length=10), nullable=True))
    op.add_column("tenants", sa.Column("contact_phone_number", sa.String(length=50), nullable=True))
    op.add_column("tenants", sa.Column("address", sa.String(length=500), nullable=True))
    op.add_column("tenants", sa.Column("ntn_number", sa.String(length=100), nullable=True))
    op.add_column("tenants", sa.Column("notes", sa.String(length=1000), nullable=True))
    op.add_column("tenants", sa.Column("national_id_file_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "national_id_file_name")
    op.drop_column("tenants", "notes")
    op.drop_column("tenants", "ntn_number")
    op.drop_column("tenants", "address")
    op.drop_column("tenants", "contact_phone_number")
    op.drop_column("tenants", "contact_phone_country_code")
    op.drop_column("tenants", "contact_email")
    op.drop_column("tenants", "contact_name")

