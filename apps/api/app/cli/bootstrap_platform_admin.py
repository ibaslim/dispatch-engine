"""
Bootstrap script to create the initial platform admin user.

Usage:
    python -m app.cli.bootstrap_platform_admin \
        --email admin@dispatch.local \
        --password SuperSecret123 \
        --name "Platform Admin"

This should only be run once on a fresh database.
"""

import argparse
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory
from app.core.security import hash_password
from app.models.user import User, UserRole


async def _bootstrap(email: str, password: str, name: str) -> None:
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email == email.lower()))
        existing = result.scalar_one_or_none()
        if existing is not None:
            print(f"[bootstrap] User with email '{email}' already exists (id={existing.id}).")
            sys.exit(1)

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

        print(f"[bootstrap] Platform admin created: id={user.id} email={user.email}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap platform admin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--name", default="Platform Admin", help="Admin display name")
    args = parser.parse_args()

    if len(args.password) < 8:
        print("[bootstrap] Password must be at least 8 characters.")
        sys.exit(1)

    asyncio.run(_bootstrap(args.email, args.password, args.name))


if __name__ == "__main__":
    main()
