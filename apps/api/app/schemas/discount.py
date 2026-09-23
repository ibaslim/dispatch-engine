from datetime import datetime, time
from typing import List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.discount import (
    DiscountKind,
    DiscountReason,
    DiscountStatus,
    DiscountTrigger,
    DiscountValueMode,
)


# -------------------------
# SCHEDULES (when a discount applies, and how often it comes back)
# -------------------------
class AlwaysSchedule(BaseModel):
    kind: Literal["always"] = "always"


class TimeWindowMixin(BaseModel):
    """An optional window inside the matching day."""
    time_start: Optional[time] = None
    time_end: Optional[time] = None


class WeeklySchedule(TimeWindowMixin):
    kind: Literal["weekly"] = "weekly"
    # Monday is 0, matching datetime.weekday(). Empty means every day.
    days: List[int] = Field(default_factory=list)


class AnnualSchedule(TimeWindowMixin):
    """A fixed date every year, such as Christmas."""
    kind: Literal["annual"] = "annual"
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    duration_days: int = Field(default=1, ge=1, le=90)


class AnnualNthWeekdaySchedule(TimeWindowMixin):
    """A moving date every year, such as the day after US Thanksgiving."""
    kind: Literal["annual_nth_weekday"] = "annual_nth_weekday"
    month: int = Field(ge=1, le=12)
    weekday: int = Field(ge=0, le=6)
    # 1-5, or -1 for the last one in the month.
    nth: int = Field(default=1, ge=-1, le=5)
    offset_days: int = Field(default=0, ge=-14, le=14)
    duration_days: int = Field(default=1, ge=1, le=90)


class DateListSchedule(TimeWindowMixin):
    kind: Literal["date_list"] = "date_list"
    dates: List[str] = Field(default_factory=list)


Schedule = Union[
    AlwaysSchedule,
    WeeklySchedule,
    AnnualSchedule,
    AnnualNthWeekdaySchedule,
    DateListSchedule,
]


# -------------------------
# DISCOUNT TYPES
# -------------------------
class DiscountTypeInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)


class DiscountTypeOut(DiscountTypeInput):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Blocks deletion, so the admin list can say why.
    discount_count: int = 0


# -------------------------
# DISCOUNTS
# -------------------------
class DiscountInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    # Falls back to the title, so a receipt always has something to print.
    public_label: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    discount_type_id: Optional[UUID] = None

    kind: DiscountKind
    # fixed: the admin sets the amount. entered: the dispatcher types it per order.
    value_mode: DiscountValueMode = DiscountValueMode.fixed
    value: Optional[float] = Field(default=None, gt=0)
    schedule: Schedule = Field(default_factory=AlwaysSchedule, discriminator="kind")
    trigger: DiscountTrigger = DiscountTrigger.manual
    status: DiscountStatus = DiscountStatus.draft
    reason: Optional[DiscountReason] = None

    max_discount_amount: Optional[float] = Field(default=None, gt=0)
    min_gross_fee: Optional[float] = Field(default=None, ge=0)
    min_net_fee: float = Field(default=0, ge=0)

    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    usage_limit_total: Optional[int] = Field(default=None, ge=1)
    usage_limit_per_tenant: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _validate(self):
        if self.trigger == DiscountTrigger.code and self.value_mode == DiscountValueMode.entered:
            raise ValueError("A coupon discount needs a fixed amount; nobody is there to type one.")
        if self.trigger == DiscountTrigger.automatic and self.value_mode == DiscountValueMode.entered:
            raise ValueError("An automatic discount needs a fixed amount; nobody is there to type one.")
        if self.value_mode == DiscountValueMode.fixed and self.value is None:
            raise ValueError("Set a value, or let the dispatcher enter one on the order.")
        if self.kind == DiscountKind.percentage and (self.value or 0) > 100:
            raise ValueError("A percentage discount cannot be more than 100%.")
        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            raise ValueError("The end of the window must come after its start.")
        self.public_label = (self.public_label or self.title).strip()
        return self


class DiscountUpdate(BaseModel):
    """Every field optional; only what is sent is changed."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    public_label: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    discount_type_id: Optional[UUID] = None

    kind: Optional[DiscountKind] = None
    value_mode: Optional[DiscountValueMode] = None
    value: Optional[float] = Field(default=None, gt=0)
    schedule: Optional[Schedule] = Field(default=None, discriminator="kind")
    trigger: Optional[DiscountTrigger] = None
    status: Optional[DiscountStatus] = None
    reason: Optional[DiscountReason] = None

    max_discount_amount: Optional[float] = Field(default=None, gt=0)
    min_gross_fee: Optional[float] = Field(default=None, ge=0)
    min_net_fee: Optional[float] = Field(default=None, ge=0)

    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    usage_limit_total: Optional[int] = Field(default=None, ge=1)
    usage_limit_per_tenant: Optional[int] = Field(default=None, ge=1)


class DiscountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    public_label: str
    description: Optional[str] = None
    discount_type_id: Optional[UUID] = None
    discount_type_title: Optional[str] = None

    kind: DiscountKind
    value_mode: DiscountValueMode
    value: Optional[float] = None
    schedule: dict = Field(default_factory=lambda: {"kind": "always"})
    # A plain sentence for the admin list and the order form.
    schedule_label: str = "Any day"
    trigger: DiscountTrigger
    status: DiscountStatus
    reason: Optional[DiscountReason] = None

    max_discount_amount: Optional[float] = None
    min_gross_fee: Optional[float] = None
    min_net_fee: float = 0

    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    usage_limit_total: Optional[int] = None
    usage_limit_per_tenant: Optional[int] = None
    redemption_count: int = 0

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AutomaticOfferOut(BaseModel):
    """One automatic discount that could apply to an order, and what became of it."""
    discount: DiscountOut
    amount: float
    # applied: taking effect. opted_out: removed from this order. outranked: a bigger
    # offer applies instead. waiting: no delivery fee to take anything off yet.
    state: Literal["applied", "opted_out", "outranked", "waiting"]


class RedemptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    discount_id: UUID
    order_id: Optional[UUID] = None
    order_number: Optional[str] = None
    tenant_id: Optional[UUID] = None
    source: DiscountTrigger
    amount: float
    status: str
    reason: Optional[str] = None
    note: Optional[str] = None
    applied_by: Optional[UUID] = None
    created_at: Optional[datetime] = None
    voided_at: Optional[datetime] = None
    voided_reason: Optional[str] = None


class DiscountUsageOut(BaseModel):
    """One row of the per-discount report."""
    discount_id: UUID
    title: str
    reason: Optional[str] = None
    uses: int
    total_amount: float


# -------------------------
# COUPONS
# -------------------------
class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    discount_id: UUID
    code: str
    max_uses: Optional[int] = None
    used_count: int = 0
    tenant_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True
    batch_label: Optional[str] = None
    created_at: Optional[datetime] = None


class CouponCreate(BaseModel):
    """A single code, typed by an admin: a public code, or one assigned to a tenant."""
    code: str = Field(min_length=4, max_length=40)
    tenant_id: Optional[UUID] = None
    max_uses: Optional[int] = Field(default=None, ge=1)
    expires_at: Optional[datetime] = None


class CouponBatchCreate(BaseModel):
    """A generated set of single-use codes."""
    count: int = Field(gt=0, le=2000)
    prefix: Optional[str] = Field(default=None, max_length=12)
    batch_label: str = Field(min_length=1, max_length=60)
    expires_at: Optional[datetime] = None


class CouponUpdate(BaseModel):
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class CouponCheckOut(BaseModel):
    """What a code resolves to, for the order form to preview before saving."""
    discount: DiscountOut
