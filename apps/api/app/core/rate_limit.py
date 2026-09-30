"""
Rate limiting on top of ``fastapi_limiter``, tuned for two things that
library's raw ``RateLimiter`` dependency doesn't do on its own:

- **Fail open.** ``tests/conftest.py`` deliberately never runs the app's
  lifespan (``FastAPILimiter.init`` included), and a Redis blip in production
  shouldn't take down login or dispatch. Either way, a broken limiter should
  let requests through, not 500 them.
- **Key by driver, not just IP**, for authenticated endpoints shared by a
  fleet behind the same NAT/proxy — see ``identify_user_or_ip``.
"""
import logging
from typing import Callable, Optional

from fastapi import HTTPException, Request, Response
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
from jose import JWTError
from starlette.requests import Request as StarletteRequest

from app.core.security import decode_access_token

logger = logging.getLogger(__name__)


async def identify_user_or_ip(request: StarletteRequest) -> str:
    """Key by the access token's subject when there is one, else by IP.

    Keeps a fleet of drivers behind one NAT/proxy from sharing a single
    bucket, without duplicating the real auth dependency's DB lookup — a
    request with no usable token fails real auth anyway.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ")
        try:
            payload = decode_access_token(token)
            subject = payload.get("sub")
            if subject:
                return f"user:{subject}:{request.scope['path']}"
        except JWTError:
            pass

    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0] if forwarded else (request.client.host if request.client else "unknown")
    return f"ip:{ip}:{request.scope['path']}"


def rate_limit(times: int, seconds: int, identifier: Optional[Callable] = None) -> Callable:
    """Build a fail-open FastAPI dependency around ``fastapi_limiter``'s ``RateLimiter``."""
    limiter = RateLimiter(times=times, seconds=seconds, identifier=identifier)

    async def dependency(request: Request, response: Response) -> None:
        if FastAPILimiter.redis is None:
            return
        try:
            await limiter(request, response)
        except HTTPException:
            raise
        except Exception:
            logger.warning("Rate limiter check failed; letting the request through.", exc_info=True)

    return dependency
