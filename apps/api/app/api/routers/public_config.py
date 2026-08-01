from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings


router = APIRouter()


class PublicConfigResponse(BaseModel):
    google_maps_api_key: str
    pusher_enabled: bool
    pusher_key: str
    pusher_cluster: str


@router.get("/config", response_model=PublicConfigResponse)
async def get_public_config() -> PublicConfigResponse:
    """Return browser-safe runtime configuration for the web clients."""
    return PublicConfigResponse(
        google_maps_api_key=settings.google_maps_api_key,
        pusher_enabled=settings.pusher_enabled,
        pusher_key=settings.pusher_key if settings.pusher_enabled else "",
        pusher_cluster=settings.pusher_cluster if settings.pusher_enabled else "",
    )
