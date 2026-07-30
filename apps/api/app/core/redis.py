"""
Async Redis client management.

A single connection pool is created at application startup (wired into the
FastAPI lifespan in main.py) and torn down on shutdown.  Every router or
service that needs Redis receives an ``asyncio.Redis`` instance through
``Depends(get_redis)`` — no module-level globals leak into business code.
"""
from typing import AsyncGenerator

import redis.asyncio as aioredis

from app.core.config import settings

# ---------------------------------------------------------------------------
# Pool – created once, shared across all requests in the process.
# ---------------------------------------------------------------------------

_pool: aioredis.Redis | None = None


async def init_redis() -> None:
    global _pool
    _pool = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """
    Yield the shared Redis client to a route handler.

    Usage::

        from app.core.redis import get_redis
        import redis.asyncio as aioredis
        from fastapi import Depends
        from typing import Annotated

        RedisClient = Annotated[aioredis.Redis, Depends(get_redis)]

        @router.post("/example")
        async def example(redis: RedisClient): ...
    """
    if _pool is None:
        raise RuntimeError(
            "Redis pool is not initialised. "
            "Ensure init_redis() is called during application startup."
        )
    yield _pool
