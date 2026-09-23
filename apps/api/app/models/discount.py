"""Discounts an admin creates and a dispatcher applies to an order.

A discount only ever comes off the platform's delivery fee: the goods value,
GST/PST and the tip are owed to the vendor and the driver, so the engine caps
every discount at the fee (see app/services/discounts).
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class DiscountKind(str, enum.Enum):
    """The mechanic. Each value has a handler in the discount engine."""
    percentage = "percentage"
    fixed_amount = "fixed_amount"


class DiscountValueMode(str, enum.Enum):
    """Where the amount comes from."""
    # The admin fixes it: "10% off", every time.
    fixed = "fixed"
    # The dispatcher types it on the order: a goodwill discount with no set size.
    entered = "entered"


class DiscountTrigger(str, enum.Enum):
    """How a discount reaches an order.""" 
    manual = "manual"
    code = "code"
    automatic = "automatic"


class DiscountStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    paused = "paused"
    ended = "ended"
    archived = "archived"


class DiscountReason(str, enum.Enum):
    late_delivery = "late_delivery"
    damaged_item = "damaged_item"
    wrong_address_our_fault = "wrong_address_our_fault"
    sales_goodwill = "sales_goodwill"
    price_correction = "price_correction"
    other = "other"


class RedemptionStatus(str, enum.Enum):
    applied = "applied"
    voided = "voided"


class DiscountType(Base, UUIDMixin, TimestampMixin):
    """An admin-managed grouping, e.g. "Service recovery". Carries no pricing."""

    __tablename__ = "discount_types"

    title: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    discounts: Mapped[list["Discount"]] = relationship("Discount", back_populates="discount_type")


class Discount(Base, UUIDMixin, TimestampMixin):
    """One offer: what comes off the delivery fee, and the limits on giving it."""

    __tablename__ = "discounts"
    __table_args__ = (
        CheckConstraint("value IS NULL OR value >= 0", name="ck_discounts_value_not_negative"),
        CheckConstraint(
            "kind <> 'percentage' OR value IS NULL OR value <= 100",
            name="ck_discounts_percentage_within_bounds",
        ),
        CheckConstraint(
            "value_mode <> 'fixed' OR value IS NOT NULL",
            name="ck_discounts_fixed_needs_value",
        ),
        CheckConstraint(
            "starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at",
            name="ck_discounts_window_ordered",
        ),
        Index("ix_discounts_status_trigger", "status", "trigger"),
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    # What the customer sees on the receipt, when it should differ from `title`.
    public_label: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    discount_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("discount_types.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(
        SAEnum(DiscountKind, name="discount_kind_enum"), nullable=False
    )
    value_mode: Mapped[str] = mapped_column(
        SAEnum(DiscountValueMode, name="discount_value_mode_enum"),
        nullable=False,
        default=DiscountValueMode.fixed,
        server_default="fixed",
    )
    # Fixed mode: the amount. Entered mode: an optional default for the form.
    value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    # When and how often this applies; see app/services/discounts/schedule.py.
    schedule: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=lambda: {"kind": "always"}
    )

    trigger: Mapped[str] = mapped_column(
        SAEnum(DiscountTrigger, name="discount_trigger_enum"),
        nullable=False,
        default=DiscountTrigger.manual,
    )
    status: Mapped[str] = mapped_column(
        SAEnum(DiscountStatus, name="discount_status_enum"),
        nullable=False,
        default=DiscountStatus.draft,
    )
    reason: Mapped[Optional[str]] = mapped_column(
        SAEnum(DiscountReason, name="discount_reason_enum"), nullable=True
    )

    # Caps. max_discount_amount bounds a percentage; min_net_fee protects margin.
    max_discount_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    min_gross_fee: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    min_net_fee: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )

    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    usage_limit_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    usage_limit_per_tenant: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Kept in step atomically, so a limit needs no COUNT on the order path.
    redemption_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    discount_type: Mapped[Optional["DiscountType"]] = relationship(
        "DiscountType", back_populates="discounts"
    )
    # passive_deletes: both FKs are ON DELETE CASCADE, so Postgres removes the
    # children itself. Without this, SQLAlchemy tries to null their discount_id
    # first, which fails since that column is NOT NULL.
    redemptions: Mapped[list["DiscountRedemption"]] = relationship(
        "DiscountRedemption", back_populates="discount", passive_deletes=True
    )
    coupons: Mapped[list["Coupon"]] = relationship(
        "Coupon", back_populates="discount", passive_deletes=True
    )


class Coupon(Base, UUIDMixin, TimestampMixin):
    """A code that unlocks one discount. It carries no price logic of its own --
    the discount it points at decides the mechanic, the caps and the schedule.
    """

    __tablename__ = "coupons"
    __table_args__ = (
        CheckConstraint(
            "max_uses IS NULL OR used_count <= max_uses", name="ck_coupons_used_within_max"
        ),
        Index("ix_coupons_batch_label", "batch_label"),
    )

    discount_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("discounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Stored upper-case with no spaces; unique so a lookup needs only the code.
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    # 1 = single-use; null = unlimited (a shared public code).
    max_uses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Set = only this vendor/individual can redeem it; null = anyone.
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True
    )
    # Code-level expiry, tighter than the discount's own window.
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    # Groups a generated batch ("Trade show Oct 2026") for export and reporting.
    batch_label: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    discount: Mapped["Discount"] = relationship("Discount", back_populates="coupons")


class DiscountRedemption(Base, UUIDMixin):
    """One use of one discount on one order. Survives the order being deleted."""

    __tablename__ = "discount_redemptions"
    __table_args__ = (
        # One live use per discount per order; a voided row may sit beside it.
        Index(
            "uq_discount_redemption_live",
            "discount_id",
            "order_id",
            unique=True,
            postgresql_where=text("status = 'applied' AND order_id IS NOT NULL"),
        ),
        Index("ix_discount_redemptions_discount_tenant", "discount_id", "tenant_id", "status"),
    )

    discount_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("discounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Which code unlocked it, when a coupon was the trigger.
    coupon_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("coupons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Copied so a deleted order is still identifiable in reports.
    order_number: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True
    )

    source: Mapped[str] = mapped_column(
        SAEnum(DiscountTrigger, name="discount_trigger_enum", create_type=False), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum(RedemptionStatus, name="redemption_status_enum"),
        nullable=False,
        default=RedemptionStatus.applied,
    )
    reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    applied_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # The discount's terms when it was applied, so later edits can't rewrite history.
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    discount: Mapped["Discount"] = relationship("Discount", back_populates="redemptions")
