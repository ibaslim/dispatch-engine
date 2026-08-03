from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.redis import init_redis, close_redis
from app.api.routers import (
    auth,
    platform,
    invitations,
    stores,
    drivers,
    tracking,
    ws,
    posts,
    orders,
    tenants,
    onboarding,
    locations,
    pricing,
    driver_payroll,
    delivery_configuration,
    public_config,
    pusher_channels,
)
from app.db.seed import seed_platform_admin
from app.db.seed_locations import seed_canadian_pricing, seed_locations
from app.db.init_db import init_db


@asynccontextmanager
async def lifespan(application: FastAPI):
    # --- Startup ---
    await init_redis()
    await init_db()
    await seed_platform_admin()
    await seed_locations()
    await seed_canadian_pricing()
    yield
    # --- Shutdown ---
    await close_redis()


def create_app() -> FastAPI:
    application = FastAPI(
        title="Dispatch Engine API",
        version="1.0.0",
        openapi_url="/openapi.json",
        docs_url="/docs",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/health", tags=["health"])
    async def health_check():
        return {"status": "ok"}

    # -------------------------
    # API ROUTES
    # -------------------------
    application.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    application.include_router(platform.router, prefix="/api/v1/platform", tags=["platform"])
    application.include_router(invitations.router, prefix="/api/v1/invitations", tags=["invitations"])
    application.include_router(tenants.router, prefix="/api/v1/tenants", tags=["tenants"])
    application.include_router(stores.router, prefix="/api/v1/stores", tags=["stores"])
    application.include_router(posts.router, prefix="/api/v1/posts", tags=["posts"])
    application.include_router(drivers.router, prefix="/api/v1/drivers", tags=["drivers"])
    application.include_router(tracking.router, prefix="/api/v1/tracking", tags=["tracking"])
    application.include_router(ws.router, prefix="/api/v1", tags=["websocket"])
    application.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
    application.include_router(onboarding.router, prefix="/api/v1/onboarding", tags=["onboarding"])
    application.include_router(locations.router, prefix="/api/v1/locations", tags=["locations"])
    application.include_router(public_config.router, prefix="/api/v1/public", tags=["public-config"])
    application.include_router(
        pusher_channels.router,
        prefix="/api/v1/pusher",
        tags=["pusher"],
    )
    application.include_router(pricing.router, prefix="/api/v1/pricing", tags=["pricing"])
    application.include_router(
        driver_payroll.router,
        prefix="/api/v1/driver-payroll",
        tags=["driver-payroll"],
    )
    application.include_router(
        delivery_configuration.router,
        prefix="/api/v1/configurations",
        tags=["delivery-configuration"],
    )

    return application


app = create_app()
