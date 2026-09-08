from uuid import UUID
from pydantic import BaseModel, Field


class LocationIn(BaseModel):
    """Coordinates sent by the mobile app on each location heartbeat."""
    lat: float = Field(..., ge=-90.0, le=90.0, description="WGS-84 latitude")
    lng: float = Field(..., ge=-180.0, le=180.0, description="WGS-84 longitude")

    model_config = {"from_attributes": True}



class LocationOut(BaseModel):
    """Last known driver position returned to the tracking page."""
    driver_id: UUID
    lat: float
    lng: float
    updated_at: str


class CountryOut(BaseModel):
    id: UUID
    name: str
    code: str

    model_config = {"from_attributes": True}


class StateOut(BaseModel):
    id: UUID
    name: str
    country_id: UUID

    model_config = {"from_attributes": True}


class CityOut(BaseModel):
    id: UUID
    name: str
    state_id: UUID

    model_config = {"from_attributes": True}
