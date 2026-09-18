from sqlalchemy import CheckConstraint, Column, String, Integer, Float, Numeric, DateTime, Boolean, JSON, Enum, ForeignKey, text
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum
import uuid
from datetime import datetime


class OrderStatus(str, enum.Enum):
    current = "current"
    scheduled = "scheduled"
    completed = "completed"
    incomplete = "incomplete"
    history = "history"


class ActivityStatus(str, enum.Enum):
    driver_not_assigned = "driver_not_assigned"
    pickup_initiated = "pickup_initiated"
    picked_up = "picked_up"
    delivery_initiated = "delivery_initiated"
    delivery_in_progress = "delivery_in_progress"
    delivered = "delivered"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        # A date-only stop always stores 00:00, so it sorts with its day and never carries a stray time.
        CheckConstraint(
            "pickup_time_specified OR pickup_planned_at::time = '00:00'",
            name="ck_orders_pickup_date_only_midnight",
        ),
        CheckConstraint(
            "delivery_time_specified OR delivery_planned_at::time = '00:00'",
            name="ck_orders_delivery_date_only_midnight",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number = Column(String, unique=True, nullable=False)

    # Driver assignment
    driver_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)

    pickup_name = Column(String)
    pickup_phone = Column(String)
    pickup_email=Column(String)
    pickup_address = Column(String)
    # Planned wall-clock time; *_time_specified False means date-only.
    pickup_planned_at = Column(DateTime(timezone=False), nullable=False)
    pickup_time_specified = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    delivery_name = Column(String)
    delivery_phone = Column(String)
    delivery_email = Column(String)
    delivery_address = Column(String)
    delivery_planned_at = Column(DateTime(timezone=False), nullable=False)
    delivery_time_specified = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    delivery_category_id = Column(
        UUID(as_uuid=True), ForeignKey("delivery_categories.id", ondelete="SET NULL"), nullable=True
    )
    pickup_place_id = Column(String, nullable=True)
    pickup_latitude = Column(Float, nullable=True)
    pickup_longitude = Column(Float, nullable=True)
    pickup_city_id = Column(UUID(as_uuid=True), ForeignKey("cities.id", ondelete="SET NULL"), nullable=True)
    pickup_zone_id = Column(
        UUID(as_uuid=True), ForeignKey("operational_zones.id", ondelete="SET NULL"), nullable=True
    )
    delivery_place_id = Column(String, nullable=True)
    delivery_latitude = Column(Float, nullable=True)
    delivery_longitude = Column(Float, nullable=True)
    delivery_city_id = Column(UUID(as_uuid=True), ForeignKey("cities.id", ondelete="SET NULL"), nullable=True)
    delivery_zone_id = Column(
        UUID(as_uuid=True), ForeignKey("operational_zones.id", ondelete="SET NULL"), nullable=True
    )
    route_distance_meters = Column(Integer, nullable=True)
    route_duration_seconds = Column(Integer, nullable=True)
    surcharge_ids = Column(JSON, nullable=False, default=list)
    applied_charges = Column(JSON, nullable=False, default=list)

    items = Column(JSON)

    subtotal = Column(Float, default=0)
    gst_rate = Column(Float, default=0)
    gst_amount = Column(Float, default=0)
    pst_rate = Column(Float, default=0)
    pst_amount = Column(Float, default=0)
    delivery_fees = Column(Float, default=0)
    delivery_tips = Column(Float, default=0)
    # Server-priced discount lines; `discount` is their sum.
    discount = Column(Float, default=0)
    applied_discounts = Column(JSON, nullable=False, default=list)
    coupon_code = Column(String(40), nullable=True)
    total = Column(Float, default=0)

    # Immutable payout agreed when a driver is assigned/accepts the delivery.
    driver_payout = Column(Numeric(10, 2), nullable=True)
    driver_fee_payout = Column(Numeric(10, 2), nullable=True)
    driver_tip_payout = Column(Numeric(10, 2), nullable=True)
    driver_payment_rule = Column(String(24), nullable=True)
    driver_payment_group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("driver_payment_groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    driver_payment_group_name = Column(String(100), nullable=True)
    driver_payment_rule_snapshot = Column(JSON, nullable=True)
    driver_payout_locked_at = Column(DateTime(timezone=True), nullable=True)

    instructions = Column(String)
    payment_method = Column(String)
    payment_details = Column(JSON)
    proof_of_delivery = Column(JSON, nullable=True)
    pickup_verification = Column(JSON, nullable=True)
    incident_report = Column(JSON, nullable=True)

    status = Column(Enum(OrderStatus, name="orderstatus_enum"), default=OrderStatus.current)
    activity_status = Column(
        Enum(ActivityStatus, name="activitystatus_enum"),
        default=ActivityStatus.driver_not_assigned,
    )
    ready_for_pickup = Column(Boolean, default=False)

    # Activity status checkpoint timestamps
    pickup_initiated_at = Column(DateTime(timezone=True), nullable=True)
    picked_up_at = Column(DateTime(timezone=True), nullable=True)
    delivery_initiated_at = Column(DateTime(timezone=True), nullable=True)
    delivery_in_progress_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    # Broadcast / publish state
    published = Column(Boolean, default=False, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

    order_placed_time = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    driver = relationship("Tenant", foreign_keys=[driver_id], backref="orders")
    vendor = relationship("Tenant", foreign_keys=[vendor_id], backref="vendor_orders")
