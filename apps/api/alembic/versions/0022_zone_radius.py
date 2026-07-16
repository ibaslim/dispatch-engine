"""Move included radius from category prices to the zone.

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-15 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    zone_columns = _columns("operational_zones")
    price_columns = _columns("zone_category_prices")

    if "radius_km" not in zone_columns:
        op.add_column(
            "operational_zones",
            sa.Column(
                "radius_km",
                sa.Numeric(8, 2),
                server_default="30.00",
                nullable=False,
            ),
        )
    if "radius_km" in price_columns:
        # Preserve one existing value for each zone before normalizing the field.
        op.execute(
            sa.text(
                "UPDATE operational_zones AS zone "
                "SET radius_km = source.radius_km "
                "FROM ("
                "  SELECT DISTINCT ON (zone_id) zone_id, radius_km "
                "  FROM zone_category_prices "
                "  ORDER BY zone_id, created_at"
                ") AS source "
                "WHERE zone.id = source.zone_id"
            )
        )
        op.drop_column("zone_category_prices", "radius_km")


def downgrade() -> None:
    if "radius_km" not in _columns("zone_category_prices"):
        op.add_column(
            "zone_category_prices",
            sa.Column(
                "radius_km",
                sa.Numeric(8, 2),
                server_default="30.00",
                nullable=False,
            ),
        )
        op.execute(
            sa.text(
                "UPDATE zone_category_prices AS price "
                "SET radius_km = zone.radius_km "
                "FROM operational_zones AS zone "
                "WHERE price.zone_id = zone.id"
            )
        )
    if "radius_km" in _columns("operational_zones"):
        op.drop_column("operational_zones", "radius_km")
