"""Per-line discount breakdown on an order, plus the coupon code used.

The client used to send a free-form `discount` amount. The server now prices
every discount itself and stores one line per discount in `applied_discounts`,
with `discount` as their sum. Existing non-zero discounts are backfilled as a
single manual line so receipts keep showing them and no total changes.

Revision ID: 0039
Revises: 0038
Create Date: 2026-09-18 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0039"
down_revision: Union[str, None] = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("orders")
    if "applied_discounts" not in columns:
        op.add_column(
            "orders",
            sa.Column("applied_discounts", sa.JSON(), server_default="[]", nullable=False),
        )
    if "coupon_code" not in columns:
        op.add_column("orders", sa.Column("coupon_code", sa.String(40), nullable=True))

    # A legacy discount has no kind or reason recorded; it becomes one fixed line
    # so the amount still prints and the order total stays untouched.
    op.execute(
        """
        UPDATE orders
           SET applied_discounts = json_build_array(
                   json_build_object(
                       'source', 'manual',
                       'kind', 'fixed_amount',
                       'label', 'Discount',
                       'value', COALESCE(discount, 0),
                       'amount', COALESCE(discount, 0),
                       'reason', 'legacy',
                       'note', NULL,
                       'applied_by', NULL
                   )
               )
         WHERE COALESCE(discount, 0) > 0
           AND COALESCE(applied_discounts::text, '[]') IN ('[]', 'null')
        """
    )


def downgrade() -> None:
    columns = _columns("orders")
    if "coupon_code" in columns:
        op.drop_column("orders", "coupon_code")
    if "applied_discounts" in columns:
        op.drop_column("orders", "applied_discounts")
