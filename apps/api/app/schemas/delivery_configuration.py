import uuid
from datetime import date, time
from decimal import Decimal
from typing import Annotated, Optional

from pydantic import BaseModel, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
Distance = Annotated[Decimal, Field(gt=0, max_digits=8, decimal_places=2)]
TaxPercentage = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]
# Three decimals because Quebec's QST is 9.975%.
OptionalTaxPercentage = Annotated[
    Optional[Decimal], Field(default=None, ge=0, le=100, max_digits=6, decimal_places=3)
]


class ZoneInput(BaseModel):
    name: Name
    city_ids: list[uuid.UUID] = Field(min_length=1)


class DeliveryPolicyInput(BaseModel):
    allow_intercity: bool


class ZoneCityOut(BaseModel):
    id: uuid.UUID
    name: str
    state_id: uuid.UUID
    state_name: str


class ZoneOut(BaseModel):
    id: uuid.UUID
    name: str
    radius_km: Distance
    gst_percentage: OptionalTaxPercentage = None
    cities: list[ZoneCityOut]


class ZoneRadiusInput(BaseModel):
    radius_km: Distance


class ZoneGstInput(BaseModel):
    gst_percentage: OptionalTaxPercentage = None


class CategoryInput(BaseModel):
    name: Name
    description: Description


class CategoryOut(CategoryInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class AfterHoursInput(BaseModel):
    start_time: time
    end_time: time
    extra_amount: Money

    @model_validator(mode="after")
    def times_must_differ(self):
        if self.start_time == self.end_time:
            raise ValueError("Start and end time must be different.")
        return self


class AfterHoursOut(AfterHoursInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class BasePriceInput(BaseModel):
    individual_price: Money
    partner_price: Money
    individual_out_of_radius_per_km: Money
    partner_out_of_radius_per_km: Money


class PartnerPriceInput(BaseModel):
    price: Money
    out_of_radius_per_km: Money


class PartnerPriceOverrideOut(BaseModel):
    id: uuid.UUID
    partner_id: uuid.UUID
    partner_name: str
    price: Money
    out_of_radius_per_km: Money


class BasePriceOut(BasePriceInput):
    id: uuid.UUID
    zone_id: uuid.UUID
    zone_name: str
    category_id: uuid.UUID
    category_name: str
    partner_overrides: list[PartnerPriceOverrideOut]


class ProvinceZoneOut(BaseModel):
    id: uuid.UUID
    name: str
    gst_percentage: OptionalTaxPercentage = None


class ProvinceTaxOut(BaseModel):
    state_id: uuid.UUID
    state_name: str
    pst_percentage: OptionalTaxPercentage = None
    zones: list[ProvinceZoneOut]


class ProvinceTaxInput(BaseModel):
    pst_percentage: OptionalTaxPercentage = None


class SurchargeInput(BaseModel):
    name: Name
    extra_amount: Money


class SurchargeOut(SurchargeInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class SpecialOccasionInput(BaseModel):
    name: Name
    occasion_date: date
    repeats_annually: bool = False
    extra_percentage: TaxPercentage


class SpecialOccasionOut(SpecialOccasionInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}
