import enum
from datetime import datetime

from pydantic import AfterValidator, BaseModel, Field, field_validator, model_validator
from typing import Annotated, List, Optional, Dict, Any
from app.models.order import OrderStatus, ActivityStatus
from uuid import UUID


def normalize_planned_at(planned_at: datetime, time_specified: bool) -> datetime:
    """Minute precision, and midnight for a date-only stop, matching the orders CHECK constraints."""
    planned_at = planned_at.replace(second=0, microsecond=0)
    return planned_at if time_specified else planned_at.replace(hour=0, minute=0)


def _wall_clock(value: datetime) -> datetime:
    if value.tzinfo is not None:
        raise ValueError("Send local wall-clock time without a timezone offset.")
    return value


# Planned stop time as entered, with no timezone.
PlannedAt = Annotated[datetime, AfterValidator(_wall_clock)]


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


class DiscountSelection(BaseModel):
    """A discount picked for an order, with the value typed for it if it needs one."""
    discount_id: UUID
    value: Optional[float] = Field(default=None, gt=0)


class AppliedDiscountResponse(BaseModel):
    """One priced discount line as stored on the order."""
    discount_id: Optional[str] = None
    source: str
    kind: str
    label: str
    value: float = 0
    amount: float = 0
    reason: Optional[str] = None
    note: Optional[str] = None
    applied_by: Optional[str] = None


class PublicOrderTracking(BaseModel):
    """Order details exposed on the public tracking page. No contact,
    payment or internal info — only what the recipient needs to see."""
    order_number: str
    status: OrderStatus
    activity_status: ActivityStatus
    driver_id: Optional[UUID] = None
    driver_name: Optional[str] = None

    pickup_name: Optional[str] = None
    pickup_address: Optional[str] = None
    pickup_planned_at: Optional[datetime] = None
    pickup_time_specified: Optional[bool] = None

    delivery_name: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_planned_at: Optional[datetime] = None
    delivery_time_specified: Optional[bool] = None

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
    pickup_planned_at: PlannedAt
    # False means date-only; the time part is then stored as 00:00.
    pickup_time_specified: bool

    delivery_name: str
    delivery_phone: str
    delivery_email: str
    delivery_address: str
    delivery_planned_at: PlannedAt
    delivery_time_specified: bool

    delivery_category_id: Optional[UUID] = None
    pickup_place_id: Optional[str] = None
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_city_id: Optional[UUID] = None
    pickup_zone_id: Optional[UUID] = None
    delivery_place_id: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    delivery_city_id: Optional[UUID] = None
    delivery_zone_id: Optional[UUID] = None
    route_distance_meters: Optional[int] = None
    route_duration_seconds: Optional[int] = None
    surcharge_ids: List[UUID] = Field(default_factory=list)
    applied_charges: List[Dict[str, Any]] = Field(default_factory=list)

    items: List[OrderItem]

    subtotal: float
    gst_rate: float = 0
    gst_amount: float = 0
    pst_rate: float = 0
    pst_amount: float = 0
    delivery_fees: float
    delivery_tips: float
    # `discount` is not accepted from the client: it picks discounts, and the
    # server prices them, capped at the delivery fee.
    discounts: List[DiscountSelection] = Field(default_factory=list)
    discount_note: Optional[str] = Field(default=None, max_length=500)
    # Automatic discounts to leave off this order.
    opted_out_discount_ids: List[UUID] = Field(default_factory=list)
    # A coupon code, resolved server-side to whichever discount it unlocks.
    coupon_code: Optional[str] = Field(default=None, max_length=40)
    total: float

    instructions: Optional[str] = None

    order_placed_time: Optional[str] = None

    payment_method: str
    payment_details: Optional[Dict[str, Any]] = None
    proof_of_delivery: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def _normalize_schedule(self):
        self.pickup_planned_at = normalize_planned_at(self.pickup_planned_at, self.pickup_time_specified)
        self.delivery_planned_at = normalize_planned_at(self.delivery_planned_at, self.delivery_time_specified)
        return self


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
    pickup_planned_at: Optional[PlannedAt] = None
    pickup_time_specified: Optional[bool] = None

    delivery_name: Optional[str] = None
    delivery_phone: Optional[str] = None
    delivery_email: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_planned_at: Optional[PlannedAt] = None
    delivery_time_specified: Optional[bool] = None

    delivery_category_id: Optional[UUID] = None
    pickup_place_id: Optional[str] = None
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_city_id: Optional[UUID] = None
    pickup_zone_id: Optional[UUID] = None
    delivery_place_id: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    delivery_city_id: Optional[UUID] = None
    delivery_zone_id: Optional[UUID] = None
    route_distance_meters: Optional[int] = None
    route_duration_seconds: Optional[int] = None
    surcharge_ids: Optional[List[UUID]] = None
    applied_charges: Optional[List[Dict[str, Any]]] = None

    items: Optional[List[OrderItem]] = None

    subtotal: Optional[float] = None
    gst_rate: Optional[float] = None
    gst_amount: Optional[float] = None
    pst_rate: Optional[float] = None
    pst_amount: Optional[float] = None
    delivery_fees: Optional[float] = None
    delivery_tips: Optional[float] = None
    # Sending discounts replaces the order's discounts; an empty list clears
    # them. Leaving it out keeps whatever the order already has.
    discounts: Optional[List[DiscountSelection]] = None
    discount_note: Optional[str] = Field(default=None, max_length=500)
    opted_out_discount_ids: Optional[List[UUID]] = None
    # Sending it replaces the order's coupon; null clears it. Leaving it out
    # keeps whatever the order already has.
    coupon_code: Optional[str] = Field(default=None, max_length=40)
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
# PICKUP VERIFICATION
# -------------------------
class PickupQrConfirm(BaseModel):
    code: str
    
# -------------------------
# RESPONSE
# -------------------------
class OrderResponse(OrderCreate):
    id: UUID
    status: OrderStatus
    activity_status: ActivityStatus
    ready_for_pickup: bool
    # Server-priced: the total plus the line per discount it came from.
    discount: float = 0
    applied_discounts: List[AppliedDiscountResponse] = Field(default_factory=list)
    coupon_code: Optional[str] = None
    # Input-only; the applied lines above are what a client reads back.
    discounts: List[DiscountSelection] = Field(default_factory=list, exclude=True)
    discount_note: Optional[str] = Field(default=None, exclude=True)

    @field_validator("applied_discounts", "opted_out_discount_ids", mode="before")
    @classmethod
    def _no_lines_is_an_empty_list(cls, value):
        """An order created before the breakdown existed carries no lines."""
        return value or []
    published: bool = False
    published_at: Optional[datetime] = None
    order_placed_time: Optional[str] = None
    proof_of_delivery: Optional[Dict[str, Any]] = None
    pickup_verification: Optional[Dict[str, Any]] = None
    incident_report: Optional[Dict[str, Any]] = None
    driver: Optional[DriverInfo] = None
    created_at: Optional[datetime] = None
    driver_payout: Optional[float] = None
    driver_fee_payout: Optional[float] = None
    driver_tip_payout: Optional[float] = None
    driver_payment_rule: Optional[str] = None
    driver_payment_group_id: Optional[UUID] = None
    driver_payment_group_name: Optional[str] = None
    driver_payout_locked_at: Optional[datetime] = None


    class Config:
        from_attributes = True


# -------------------------
# STATUS / READY / DRIVER ASSIGNMENT
# -------------------------
class StatusUpdate(BaseModel):
    status: OrderStatus


class ReadyUpdate(BaseModel):
    ready: bool


class AssignDriverRequest(BaseModel):
    driver_id: UUID


# -------------------------
# DELIVERY QUOTE
# -------------------------
class DeliveryQuoteRequest(BaseModel):
    pickup_place_id: str
    delivery_place_id: str
    pickup_address: str | None = None
    delivery_address: str | None = None
    delivery_category_id: UUID
    vendor_id: UUID | None = None
    delivery_planned_at: Optional[PlannedAt] = None
    delivery_time_specified: bool = False
    surcharge_ids: list[UUID] = Field(default_factory=list)


class AppliedChargeResponse(BaseModel):
    id: UUID | None
    kind: str
    label: str
    amount: float


class DeliveryQuoteResponse(BaseModel):
    eligible: bool = True
    pickup_city: str
    pickup_zone_id: UUID
    pickup_zone_name: str
    delivery_city: str
    delivery_zone_id: UUID
    delivery_zone_name: str
    distance_meters: int
    distance_km: float
    duration_seconds: int
    radius_km: float
    extra_distance_km: float
    base_price: float
    additional_per_km: float
    distance_charge: float
    applied_charges: list[AppliedChargeResponse]
    delivery_fee: float
    # Pickup zone's tax rates, so the order form previews what the server will charge.
    gst_rate: float = 0
    pst_rate: float = 0
    manual_fallback: bool = False


class RouteStopResponse(BaseModel):
    """One stop on the driver's ordered run."""
    sequence: int
    order_id: UUID
    order_number: Optional[str] = None
    kind: str
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    place_id: Optional[str] = None
    # Driving from the previous stop (or the driver, for the first one).
    leg_distance_meters: Optional[int] = None
    leg_duration_seconds: Optional[int] = None


class UnplaceableStopResponse(BaseModel):
    """An outstanding order that can't be routed because it has no coordinates."""
    order_id: UUID
    order_number: Optional[str] = None
    kind: str
    address: Optional[str] = None


class RoutePlanResponse(BaseModel):
    origin_latitude: float
    origin_longitude: float
    stops: List[RouteStopResponse]
    unplaceable: List[UnplaceableStopResponse] = Field(default_factory=list)
    total_distance_meters: Optional[int] = None
    total_duration_seconds: Optional[int] = None
    # "routes_api" figures use live traffic; "local" ones are straight-line estimates.
    optimized_by: str
