from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, JSON, Enum
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base
import enum
import uuid


class OrderStatus(str, enum.Enum):
    current = "current"
    scheduled = "scheduled"
    completed = "completed"
    incomplete = "incomplete"
    history = "history"


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number = Column(String, unique=True, nullable=False)

    pickup_name = Column(String)
    pickup_phone = Column(String)
    pickup_address = Column(String)
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

    status = Column(Enum(OrderStatus), default=OrderStatus.current)
    ready_for_pickup = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())