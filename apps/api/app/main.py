from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routers import auth, platform, invitations, stores, drivers, tracking, ws, posts
from app.db.seed import seed_platform_admin


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Startup – auto-seed admin on first boot
    await seed_platform_admin()
    yield
    # Shutdown


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

    application.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    application.include_router(platform.router, prefix="/api/v1/platform", tags=["platform"])
    application.include_router(invitations.router, prefix="/api/v1/invitations", tags=["invitations"])
    application.include_router(stores.router, prefix="/api/v1/stores", tags=["stores"])
    application.include_router(posts.router, prefix="/api/v1/posts", tags=["posts"])
    application.include_router(drivers.router, prefix="/api/v1/drivers", tags=["drivers"])
    application.include_router(tracking.router, prefix="/api/v1/tracking", tags=["tracking"])
    application.include_router(ws.router, prefix="/api/v1", tags=["websocket"])

    return application


app = create_app()
