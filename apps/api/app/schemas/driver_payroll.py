import uuid
from decimal import Decimal
from typing import List, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.location import (
    DEFAULT_DRIVER_BASE_SALARY,
    DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
)

PaymentRuleType = Literal["fixed", "percentage", "passthrough"]


class PaymentGroupInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rule_type: PaymentRuleType
    fixed_amount: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    delivery_fee_percentage: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    platform_tip_percentage: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    driver_ids: list[uuid.UUID] = Field(default_factory=list)
    confirm_reassignments: bool = False

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("driver_ids")
    @classmethod
    def unique_driver_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def validate_rule_values(self):
        if self.rule_type == "fixed" and self.fixed_amount is None:
            raise ValueError("A fixed amount is required for fixed pay per delivery.")
        if self.rule_type in {"percentage", "passthrough"} and self.delivery_fee_percentage is None:
            raise ValueError("A delivery fee percentage is required for this payment rule.")
        if self.rule_type == "passthrough" and self.platform_tip_percentage is None:
            raise ValueError("A platform tip percentage is required for pass-through earnings.")
        return self


class PaymentGroupDriverOut(BaseModel):
    id: uuid.UUID
    name: str


class PaymentGroupOut(BaseModel):
    id: uuid.UUID
    name: str
    rule_type: PaymentRuleType
    fixed_amount: Decimal | None
    delivery_fee_percentage: Decimal | None
    platform_tip_percentage: Decimal | None
    drivers: list[PaymentGroupDriverOut]


class DriverCompensation(BaseModel):
    base_salary: float = Field(default=DEFAULT_DRIVER_BASE_SALARY, ge=0)
    commission_per_delivery: float = Field(
        default=DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
        ge=0,
    )


class DriverOut(BaseModel):
    id: uuid.UUID
    name: str


class DriverCityPayrollOut(DriverCompensation):
    city_id: uuid.UUID
    city_name: str


class DriverStatePayrollOut(DriverCompensation):
    state_id: uuid.UUID
    state_name: str
    cities: List[DriverCityPayrollOut]
