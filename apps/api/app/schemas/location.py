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