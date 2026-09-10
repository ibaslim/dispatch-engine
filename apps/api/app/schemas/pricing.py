import uuid
from typing import List

from pydantic import BaseModel, Field


class Rates(BaseModel):
    partner_price_per_km: float = Field(ge=0)
    partner_price_per_kg: float = Field(ge=0)
    individual_price_per_km: float = Field(ge=0)
    individual_price_per_kg: float = Field(ge=0)


class PartnerRates(BaseModel):
    price_per_km: float = Field(ge=0)
    price_per_kg: float = Field(ge=0)


class PartnerOut(BaseModel):
    id: uuid.UUID
    name: str


class CityPricingOut(Rates):
    city_id: uuid.UUID
    city_name: str


class StatePricingOut(Rates):
    state_id: uuid.UUID
    state_name: str
    cities: List[CityPricingOut]