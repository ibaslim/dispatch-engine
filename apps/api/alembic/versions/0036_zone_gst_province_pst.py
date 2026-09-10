"""Replace the global order tax with per-zone GST and per-province PST.

GST is charged from the order's pickup zone; PST from the province the pickup
city sits in, because a zone may span more than one province. Each order keeps
its own GST/PST snapshot, and the combined tax_rate/tax_amount columns created
in 0011 are dropped -- they only ever held gst + pst.

Revision ID: 0036
Revises: 0035
Create Date: 2026-09-02 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ORDER_TAX_COLUMNS = ("gst_rate", "gst_amount", "pst_rate", "pst_amount")
COMBINED_TAX_COLUMNS = ("tax_rate", "tax_amount")


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    if "gst_percentage" not in _columns("operational_zones"):
        op.add_column(
            "operational_zones",
            sa.Column("gst_percentage", sa.Numeric(6, 3), nullable=True),
        )

    if not _has_table("state_tax"):
        op.create_table(
            "state_tax",
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "state_id",
                sa.UUID(as_uuid=True),
                sa.ForeignKey("states.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
                index=True,
            ),
            sa.Column("pst_percentage", sa.Numeric(6, 3), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                onupdate=sa.func.now(),
                nullable=False,
            ),
        )

    if "default_tax_percentage" in _columns("delivery_policies"):
        op.drop_column("delivery_policies", "default_tax_percentage")

    order_columns = _columns("orders")
    for column_name in ORDER_TAX_COLUMNS:
        if column_name not in order_columns:
            op.add_column(
                "orders",
                sa.Column(column_name, sa.Float(), server_default="0", nullable=False),
            )
    for column_name in COMBINED_TAX_COLUMNS:
        if column_name in order_columns:
            op.drop_column("orders", column_name)


def downgrade() -> None:
    order_columns = _columns("orders")
    for column_name in COMBINED_TAX_COLUMNS:
        if column_name not in order_columns:
            op.add_column(
                "orders",
                sa.Column(column_name, sa.Float(), server_default="0", nullable=False),
            )
    # Rebuilt from the split columns, which is exact: the combined figure was
    # always gst + pst. Orders predating this revision are restored to 0.
    op.execute(
        sa.text(
            "UPDATE orders SET tax_rate = gst_rate + pst_rate, "
            "tax_amount = gst_amount + pst_amount"
        )
    )
    for column_name in ORDER_TAX_COLUMNS:
        if column_name in order_columns:
            op.drop_column("orders", column_name)

    if "default_tax_percentage" not in _columns("delivery_policies"):
        op.add_column(
            "delivery_policies",
            sa.Column(
                "default_tax_percentage",
                sa.Numeric(5, 2),
                server_default="0.00",
                nullable=False,
            ),
        )

    if _has_table("state_tax"):
        op.drop_table("state_tax")

    if "gst_percentage" in _columns("operational_zones"):
        op.drop_column("operational_zones", "gst_percentage")
