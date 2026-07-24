"""Add per-kilometre out-of-radius pricing.

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-15 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    zone_columns = _column_names("zone_category_prices")
    if "radius_km" not in zone_columns:
        op.add_column(
            "zone_category_prices",
            sa.Column(
                "radius_km",
                sa.Numeric(8, 2),
                server_default="30.00",
                nullable=False,
            ),
        )
    if "individual_out_of_radius_per_km" not in zone_columns:
        op.add_column(
            "zone_category_prices",
            sa.Column(
                "individual_out_of_radius_per_km",
                sa.Numeric(10, 2),
                server_default="0.00",
                nullable=False,
            ),
        )
    if "partner_out_of_radius_per_km" not in zone_columns:
        op.add_column(
            "zone_category_prices",
            sa.Column(
                "partner_out_of_radius_per_km",
                sa.Numeric(10, 2),
                server_default="0.00",
                nullable=False,
            ),
        )

    partner_columns = _column_names("partner_zone_category_prices")
    if "out_of_radius_per_km" not in partner_columns:
        op.add_column(
            "partner_zone_category_prices",
            sa.Column(
                "out_of_radius_per_km",
                sa.Numeric(10, 2),
                server_default="0.00",
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_column("partner_zone_category_prices", "out_of_radius_per_km")
    op.drop_column("zone_category_prices", "partner_out_of_radius_per_km")
    op.drop_column("zone_category_prices", "individual_out_of_radius_per_km")
    op.drop_column("zone_category_prices", "radius_km")
