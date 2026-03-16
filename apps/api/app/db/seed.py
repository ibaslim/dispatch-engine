"""
Database seeder – runs once on first boot.
Creates the platform admin if no users exist yet.
Reads credentials from environment variables with sensible dev defaults.
"""

import logging
import os

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_EMAIL = "admin@dispatch.local"
DEFAULT_ADMIN_PASSWORD = "Admin123!"
DEFAULT_ADMIN_NAME = "Platform Admin"


async def seed_platform_admin() -> None:
    """Create the platform admin if the users table is empty.

    This function is idempotent: it silently skips when any user already exists.
    """
    async with async_session_factory() as db:
        count = await db.scalar(select(func.count()).select_from(User))
        if count and count > 0:
            logger.info("[seed] Users already exist – skipping admin seed.")
            return

        email = os.getenv("PLATFORM_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL)
        password = os.getenv("PLATFORM_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
        name = os.getenv("PLATFORM_ADMIN_NAME", DEFAULT_ADMIN_NAME)

        user = User(
            email=email.lower(),
            name=name,
            hashed_password=hash_password(password),
            is_active=True,
            is_platform_admin=True,
            tenant_id=None,
        )
        db.add(user)
        await db.flush()

        role = UserRole(user_id=user.id, role="platform_admin")
        db.add(role)
        await db.commit()

        logger.info("[seed] ✅ Platform admin created: %s", email)
