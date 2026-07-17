from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings


router = APIRouter()


class PublicConfigResponse(BaseModel):
    google_maps_api_key: str


@router.get("/config", response_model=PublicConfigResponse)
async def get_public_config() -> PublicConfigResponse:
    """Return browser-safe runtime configuration for the web clients."""
    return PublicConfigResponse(google_maps_api_key=settings.google_maps_api_key)
