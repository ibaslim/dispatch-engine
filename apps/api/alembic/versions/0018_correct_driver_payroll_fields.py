"""Replace distance and weight driver rates with payroll compensation.

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-11 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("driver_pricing", "driver_state_pricing", "driver_city_pricing")


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    for table_name in TABLES:
        columns = _columns(table_name)
        if "price_per_km" in columns and "base_salary" not in columns:
            op.alter_column(table_name, "price_per_km", new_column_name="base_salary")
        if "price_per_kg" in columns and "commission_per_delivery" not in columns:
            op.alter_column(
                table_name,
                "price_per_kg",
                new_column_name="commission_per_delivery",
            )
        op.alter_column(
            table_name,
            "base_salary",
            existing_type=sa.Float(),
            server_default="200",
            nullable=False,
        )
        op.alter_column(
            table_name,
            "commission_per_delivery",
            existing_type=sa.Float(),
            server_default="0",
            nullable=False,
        )
        op.execute(
            sa.text(
                f"UPDATE {table_name} "
                "SET base_salary = 200, commission_per_delivery = 0"
            )
        )


def downgrade() -> None:
    for table_name in TABLES:
        op.alter_column(
            table_name,
            "base_salary",
            existing_type=sa.Float(),
            server_default=None,
            new_column_name="price_per_km",
        )
        op.alter_column(
            table_name,
            "commission_per_delivery",
            existing_type=sa.Float(),
            server_default=None,
            new_column_name="price_per_kg",
        )
