"""Admin-created discounts, coupon codes, and their types.

A dispatcher picks a discount on the order form instead of typing an amount, or
an automatic discount applies itself, or a coupon code unlocks one. Terms live
in `discounts`, naming in `discount_types`, codes in `coupons`. There is no
separate ledger of uses: an order's own `applied_discounts` column is the
record, so deleting an order deletes its discount history with it; only the
atomic `redemption_count`/`used_count` counters survive independently, to keep
a usage limit from ever being oversold. Orders also gain
`opted_out_discount_ids`, so removing an automatic discount from an order
sticks rather than being re-applied on the next edit.

Revision ID: 0040
Revises: 0039
Create Date: 2026-09-21 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0040"
down_revision: Union[str, None] = "0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Values per type. The types are created once, up front; the column definitions
# below then reference them with create_type=False, because a bare sa.Enum in a
# create_table emits its own CREATE TYPE and would collide with that.
ENUM_VALUES: dict[str, tuple[str, ...]] = {
    "discount_kind_enum": ("percentage", "fixed_amount"),
    "discount_value_mode_enum": ("fixed", "entered"),
    "discount_trigger_enum": ("manual", "code", "automatic"),
    "discount_status_enum": ("draft", "active", "paused", "ended", "archived"),
    "discount_reason_enum": (
        "late_delivery",
        "damaged_item",
        "wrong_address_our_fault",
        "sales_goodwill",
        "price_correction",
        "other",
    ),
}


def _column_type(name: str) -> postgresql.ENUM:
    """The existing type, for use in a column definition."""
    return postgresql.ENUM(*ENUM_VALUES[name], name=name, create_type=False)


KIND = _column_type("discount_kind_enum")
VALUE_MODE = _column_type("discount_value_mode_enum")
TRIGGER = _column_type("discount_trigger_enum")
STATUS = _column_type("discount_status_enum")
REASON = _column_type("discount_reason_enum")


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    tables = _tables()
    bind = op.get_bind()
    for name, values in ENUM_VALUES.items():
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    if "discount_types" not in tables:
        op.create_table(
            "discount_types",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("title", sa.String(120), nullable=False, unique=True),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if "discounts" not in tables:
        op.create_table(
            "discounts",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("title", sa.String(120), nullable=False),
            sa.Column("public_label", sa.String(120), nullable=False),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column(
                "discount_type_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("discount_types.id", ondelete="RESTRICT"),
                nullable=True,
            ),
            sa.Column("kind", KIND, nullable=False),
            sa.Column("value_mode", VALUE_MODE, nullable=False, server_default="fixed"),
            # Fixed mode: the amount. Entered mode: an optional default for the form.
            sa.Column("value", sa.Numeric(10, 2), nullable=True),
            # When and how often this applies; see app/services/discounts/schedule.py.
            sa.Column("schedule", sa.JSON(), nullable=False, server_default='{"kind": "always"}'),
            sa.Column("trigger", TRIGGER, nullable=False, server_default="manual"),
            sa.Column("status", STATUS, nullable=False, server_default="draft"),
            sa.Column("reason", REASON, nullable=True),
            sa.Column("max_discount_amount", sa.Numeric(10, 2), nullable=True),
            sa.Column("min_gross_fee", sa.Numeric(10, 2), nullable=True),
            sa.Column("min_net_fee", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("usage_limit_total", sa.Integer(), nullable=True),
            # Kept in step atomically, so a limit needs no COUNT on the order path.
            sa.Column("redemption_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "updated_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint("value IS NULL OR value >= 0", name="ck_discounts_value_not_negative"),
            sa.CheckConstraint(
                "kind <> 'percentage' OR value IS NULL OR value <= 100",
                name="ck_discounts_percentage_within_bounds",
            ),
            sa.CheckConstraint(
                "value_mode <> 'fixed' OR value IS NOT NULL",
                name="ck_discounts_fixed_needs_value",
            ),
            sa.CheckConstraint(
                "starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at",
                name="ck_discounts_window_ordered",
            ),
        )
        op.create_index("ix_discounts_discount_type_id", "discounts", ["discount_type_id"])
        op.create_index("ix_discounts_status_trigger", "discounts", ["status", "trigger"])

    if "coupons" not in tables:
        op.create_table(
            "coupons",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "discount_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("discounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            # Stored upper-case with no spaces; unique so a lookup needs only the code.
            sa.Column("code", sa.String(40), nullable=False, unique=True),
            # 1 = single-use; null = unlimited (a shared public code).
            sa.Column("max_uses", sa.Integer(), nullable=True),
            sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
            # Set = only this vendor/individual can redeem it; null = anyone.
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("tenants.id", ondelete="SET NULL"),
                nullable=True,
            ),
            # Code-level expiry, tighter than the discount's own window.
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            # Groups a generated batch ("Trade show Oct 2026") for export and reporting.
            sa.Column("batch_label", sa.String(60), nullable=True),
            sa.Column(
                "created_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.CheckConstraint(
                "max_uses IS NULL OR used_count <= max_uses", name="ck_coupons_used_within_max"
            ),
        )
        op.create_index("ix_coupons_discount_id", "coupons", ["discount_id"])
        op.create_index("ix_coupons_batch_label", "coupons", ["batch_label"])

    if "opted_out_discount_ids" not in _columns("orders"):
        op.add_column(
            "orders",
            sa.Column("opted_out_discount_ids", sa.JSON(), server_default="[]", nullable=False),
        )


def downgrade() -> None:
    tables = _tables()
    if "opted_out_discount_ids" in _columns("orders"):
        op.drop_column("orders", "opted_out_discount_ids")
    if "coupons" in tables:
        op.drop_table("coupons")
    if "discounts" in tables:
        op.drop_table("discounts")
    if "discount_types" in tables:
        op.drop_table("discount_types")
    bind = op.get_bind()
    for name in ENUM_VALUES:
        sa.Enum(name=name).drop(bind, checkfirst=True)
