from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.models.order import OrderStatus
from uuid import UUID


class OrderItem(BaseModel):
    itemName: str
    itemPrice: float
    itemQty: int


# -------------------------
# CREATE ORDER
# -------------------------
class OrderCreate(BaseModel):
    order_number: str

    pickup_name: str
    pickup_phone: str
    pickup_address: str
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

    payment_method: str
    payment_details: Optional[Dict[str, Any]] = None


# -------------------------
# UPDATE ORDER (NEW)
# -------------------------
class OrderUpdate(BaseModel):
    order_number: Optional[str] = None

    pickup_name: Optional[str] = None
    pickup_phone: Optional[str] = None
    pickup_address: Optional[str] = None
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

    payment_method: Optional[str] = None
    payment_details: Optional[Dict[str, Any]] = None

    status: Optional[OrderStatus] = None
    ready_for_pickup: Optional[bool] = None


# -------------------------
# RESPONSE
# -------------------------
class OrderResponse(OrderCreate):
    id: UUID
    status: OrderStatus
    ready_for_pickup: bool

    class Config:
        from_attributes = True