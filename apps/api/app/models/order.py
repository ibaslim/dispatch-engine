from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, JSON, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum
import uuid


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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number = Column(String, unique=True, nullable=False)

    # Driver assignment
    driver_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)

    pickup_name = Column(String)
    pickup_phone = Column(String)
    pickup_address = Column(String)
    pickup_date = Column(String)
    pickup_time = Column(String)

    delivery_name = Column(String)
    delivery_phone = Column(String)
    delivery_email = Column(String)
    delivery_address = Column(String)
    delivery_date = Column(String)
    delivery_time = Column(String)

    items = Column(JSON)

    subtotal = Column(Float, default=0)
    tax_rate = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    delivery_fees = Column(Float, default=0)
    delivery_tips = Column(Float, default=0)
    discount = Column(Float, default=0)
    total = Column(Float, default=0)

    instructions = Column(String)
    payment_method = Column(String)
    payment_details = Column(JSON)
    proof_of_delivery = Column(JSON, nullable=True)

    status = Column(Enum(OrderStatus), default=OrderStatus.current)
    activity_status = Column(
        Enum(ActivityStatus, name="activitystatus_enum"),
        default=ActivityStatus.driver_not_assigned,
    )
    ready_for_pickup = Column(Boolean, default=False)

    order_placed_time = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    driver = relationship("Tenant", foreign_keys=[driver_id], backref="orders")
