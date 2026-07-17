import enum
from datetime import datetime

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.models.order import OrderStatus, ActivityStatus
from uuid import UUID


class IncidentStage(str, enum.Enum):
    pickup = "pickup"
    delivery = "delivery"


class IncidentReason(str, enum.Enum):
    no_answer = "no_answer"
    wrong_address = "wrong_address"
    business_closed = "business_closed"
    parcel_issue = "parcel_issue"
    refused = "refused"
    other = "other"


# Reasons that always require a description, regardless of stage.
INCIDENT_REASONS_REQUIRING_DESCRIPTION = {IncidentReason.other, IncidentReason.parcel_issue}

class IncidentReportCreate(BaseModel):
    stage: IncidentStage
    reason: IncidentReason
    description: Optional[str] = None


class DriverInfo(BaseModel):
    """Basic driver information"""
    id: UUID
    name: str
    contact_name: Optional[str] = None
    contact_phone_number: Optional[str] = None
    contact_phone_country_code: Optional[str] = None

    class Config:
        from_attributes = True


class OrderItem(BaseModel):
    itemName: str
    itemPrice: float
    itemQty: int


class PublicOrderTracking(BaseModel):
    """Order details exposed on the public tracking page. No contact,
    payment or internal info — only what the recipient needs to see."""
    order_number: str
    status: OrderStatus
    activity_status: ActivityStatus
    driver_name: Optional[str] = None

    pickup_name: Optional[str] = None
    pickup_address: Optional[str] = None
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None

    delivery_name: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_date: Optional[str] = None
    delivery_time: Optional[str] = None

    items_count: int = 0
    created_at: Optional[datetime] = None

    pickup_initiated_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    delivery_initiated_at: Optional[datetime] = None
    delivery_in_progress_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None


# -------------------------
# CREATE ORDER
# -------------------------
class OrderCreate(BaseModel):
    order_number: Optional[str] = None
    driver_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None

    pickup_name: str
    pickup_phone: str
    pickup_email:str
    pickup_address: str
    pickup_date: str
    pickup_time: str

    delivery_name: str
    delivery_phone: str
    delivery_email: str
    delivery_address: str
    delivery_date: str
    delivery_time: str

    items: List[OrderItem]

    subtotal: float
    tax_rate: float
    tax_amount: float
    delivery_fees: float
    delivery_tips: float
    discount: float
    total: float

    instructions: Optional[str] = None

    order_placed_time: Optional[str] = None

    payment_method: str
    payment_details: Optional[Dict[str, Any]] = None
    proof_of_delivery: Optional[Dict[str, Any]] = None


# -------------------------
# UPDATE ORDER (NEW)
# -------------------------
class OrderUpdate(BaseModel):
    order_number: Optional[str] = None
    driver_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None

    pickup_name: Optional[str] = None
    pickup_phone: Optional[str] = None
    pickup_email: Optional[str] = None
    pickup_address: Optional[str] = None
    pickup_date: Optional[str] = None
    pickup_time: Optional[str] = None

    delivery_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_email: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_date: Optional[str] = None
    delivery_time: Optional[str] = None

    items: Optional[List[OrderItem]] = None

    subtotal: Optional[float] = None
    tax_rate: Optional[float] = None
    tax_amount: Optional[float] = None
    delivery_fees: Optional[float] = None
    delivery_tips: Optional[float] = None
    discount: Optional[float] = None
    total: Optional[float] = None

    instructions: Optional[str] = None

    order_placed_time: Optional[str] = None

    payment_method: Optional[str] = None
    payment_details: Optional[Dict[str, Any]] = None
    proof_of_delivery: Optional[Dict[str, Any]] = None

    status: Optional[OrderStatus] = None
    ready_for_pickup: Optional[bool] = None

    # -------------------------
    # UPDATE ACTIVITY_STATUS
    # -------------------------
class ActivityStatusUpdate(BaseModel):
    activity_status: ActivityStatus


# -------------------------
# RESPONSE
# -------------------------
class OrderResponse(OrderCreate):
    id: UUID
    status: OrderStatus
    activity_status: ActivityStatus
    ready_for_pickup: bool
    published: bool = False
    published_at: Optional[datetime] = None
    order_placed_time: Optional[str] = None
    proof_of_delivery: Optional[Dict[str, Any]] = None
    incident_report: Optional[Dict[str, Any]] = None
    driver: Optional[DriverInfo] = None
    created_at: Optional[datetime] = None


    class Config:
        from_attributes = True