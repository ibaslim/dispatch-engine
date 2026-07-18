"""Add delivery eligibility policy and route quote fields.

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-17 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "delivery_policies" not in tables:
        op.create_table(
            "delivery_policies",
            sa.Column("key", sa.String(length=32), nullable=False),
            sa.Column("allow_intercity", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("key"),
        )

    columns = _columns("orders")
    additions = [
        ("delivery_category_id", postgresql.UUID(as_uuid=True)),
        ("pickup_place_id", sa.String()),
        ("pickup_latitude", sa.Float()),
        ("pickup_longitude", sa.Float()),
        ("pickup_city_id", postgresql.UUID(as_uuid=True)),
        ("pickup_zone_id", postgresql.UUID(as_uuid=True)),
        ("delivery_place_id", sa.String()),
        ("delivery_latitude", sa.Float()),
        ("delivery_longitude", sa.Float()),
        ("delivery_city_id", postgresql.UUID(as_uuid=True)),
        ("delivery_zone_id", postgresql.UUID(as_uuid=True)),
        ("route_distance_meters", sa.Integer()),
        ("route_duration_seconds", sa.Integer()),
    ]
    for name, column_type in additions:
        if name not in columns:
            op.add_column("orders", sa.Column(name, column_type, nullable=True))

    foreign_keys = {
        "delivery_category_id": ("delivery_categories", "fk_orders_delivery_category_id"),
        "pickup_city_id": ("cities", "fk_orders_pickup_city_id"),
        "pickup_zone_id": ("operational_zones", "fk_orders_pickup_zone_id"),
        "delivery_city_id": ("cities", "fk_orders_delivery_city_id"),
        "delivery_zone_id": ("operational_zones", "fk_orders_delivery_zone_id"),
    }
    existing_fks = {fk.get("name") for fk in sa.inspect(op.get_bind()).get_foreign_keys("orders")}
    for column_name, (target_table, constraint_name) in foreign_keys.items():
        if constraint_name not in existing_fks:
            op.create_foreign_key(
                constraint_name,
                "orders",
                target_table,
                [column_name],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    for constraint_name in [
        "fk_orders_delivery_zone_id",
        "fk_orders_delivery_city_id",
        "fk_orders_pickup_zone_id",
        "fk_orders_pickup_city_id",
        "fk_orders_delivery_category_id",
    ]:
        op.drop_constraint(constraint_name, "orders", type_="foreignkey")
    for column_name in [
        "route_duration_seconds",
        "route_distance_meters",
        "delivery_zone_id",
        "delivery_city_id",
        "delivery_longitude",
        "delivery_latitude",
        "delivery_place_id",
        "pickup_zone_id",
        "pickup_city_id",
        "pickup_longitude",
        "pickup_latitude",
        "pickup_place_id",
        "delivery_category_id",
    ]:
        op.drop_column("orders", column_name)
    op.drop_table("delivery_policies")
