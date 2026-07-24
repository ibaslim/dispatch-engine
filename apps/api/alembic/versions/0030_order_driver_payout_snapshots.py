"""Freeze driver payout terms on assigned orders.

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-19 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> set[str]:
    return {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("orders")
    }


def upgrade() -> None:
    columns = _columns()
    additions = [
        ("driver_payout", sa.Numeric(10, 2)),
        ("driver_fee_payout", sa.Numeric(10, 2)),
        ("driver_tip_payout", sa.Numeric(10, 2)),
        ("driver_payment_rule", sa.String(length=24)),
        ("driver_payment_group_name", sa.String(length=100)),
        ("driver_payment_rule_snapshot", postgresql.JSONB(astext_type=sa.Text())),
        ("driver_payout_locked_at", sa.DateTime(timezone=True)),
    ]
    for name, column_type in additions:
        if name not in columns:
            op.add_column("orders", sa.Column(name, column_type, nullable=True))

    if "driver_payment_group_id" not in columns:
        op.add_column(
            "orders",
            sa.Column("driver_payment_group_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_orders_driver_payment_group_id",
            "orders",
            "driver_payment_groups",
            ["driver_payment_group_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Preserve exactly what every already-assigned delivery earns at migration
    # time. Later group edits must never rewrite these values.
    op.execute(sa.text("""
        UPDATE orders AS o
        SET
            driver_fee_payout = ROUND(CASE
                WHEN g.rule_type = 'fixed' THEN COALESCE(g.fixed_amount, 0)
                WHEN g.rule_type IN ('percentage', 'passthrough')
                    THEN COALESCE(o.delivery_fees, 0)::numeric
                        * COALESCE(g.delivery_fee_percentage, 0) / 100
                ELSE 0
            END, 2),
            driver_tip_payout = ROUND(CASE
                WHEN g.rule_type = 'passthrough'
                    THEN COALESCE(o.delivery_tips, 0)::numeric
                        * (100 - COALESCE(g.platform_tip_percentage, 0)) / 100
                ELSE 0
            END, 2),
            driver_payout = ROUND(
                CASE
                    WHEN g.rule_type = 'fixed' THEN COALESCE(g.fixed_amount, 0)
                    WHEN g.rule_type IN ('percentage', 'passthrough')
                        THEN COALESCE(o.delivery_fees, 0)::numeric
                            * COALESCE(g.delivery_fee_percentage, 0) / 100
                    ELSE 0
                END
                + CASE
                    WHEN g.rule_type = 'passthrough'
                        THEN COALESCE(o.delivery_tips, 0)::numeric
                            * (100 - COALESCE(g.platform_tip_percentage, 0)) / 100
                    ELSE 0
                END,
                2
            ),
            driver_payment_rule = g.rule_type,
            driver_payment_group_id = g.id,
            driver_payment_group_name = g.name,
            driver_payment_rule_snapshot = jsonb_build_object(
                'group_id', g.id,
                'group_name', g.name,
                'rule_type', g.rule_type,
                'fixed_amount', g.fixed_amount,
                'delivery_fee_percentage', g.delivery_fee_percentage,
                'platform_tip_percentage', g.platform_tip_percentage
            ),
            driver_payout_locked_at = NOW()
        FROM driver_payment_group_assignments AS a
        JOIN driver_payment_groups AS g ON g.id = a.group_id
        WHERE o.driver_id = a.driver_id
          AND o.driver_id IS NOT NULL
          AND o.driver_payout IS NULL
    """))
    op.execute(sa.text("""
        UPDATE orders
        SET
            driver_payout = 0.00,
            driver_fee_payout = 0.00,
            driver_tip_payout = 0.00,
            driver_payment_rule_snapshot = jsonb_build_object(
                'group_id', NULL,
                'group_name', NULL,
                'rule_type', NULL
            ),
            driver_payout_locked_at = NOW()
        WHERE driver_id IS NOT NULL
          AND driver_payout IS NULL
    """))


def downgrade() -> None:
    columns = _columns()
    if "driver_payment_group_id" in columns:
        op.drop_constraint(
            "fk_orders_driver_payment_group_id",
            "orders",
            type_="foreignkey",
        )
    for name in [
        "driver_payout_locked_at",
        "driver_payment_rule_snapshot",
        "driver_payment_group_name",
        "driver_payment_group_id",
        "driver_payment_rule",
        "driver_tip_payout",
        "driver_fee_payout",
        "driver_payout",
    ]:
        if name in columns:
            op.drop_column("orders", name)
