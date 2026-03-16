import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import (
    verify_password,
    create_access_token,
    generate_secure_token,
    hash_password,
)
from app.core.config import settings
from app.models.user import User
from app.models.token import RefreshToken
from app.schemas.auth import TokenResponse


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def create_token_pair(db: AsyncSession, user: User) -> TokenResponse:
    access_token = create_access_token(str(user.id))

    raw_refresh = generate_secure_token(64)
    token_hash = _hash_token(raw_refresh)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(refresh_record)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
    )


async def refresh_access_token(db: AsyncSession, raw_refresh: str) -> TokenResponse | None:
    token_hash = _hash_token(raw_refresh)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record is None or not record.is_valid():
        return None

    # Rotate refresh token
    record.is_revoked = True
    db.add(record)

    user_result = await db.execute(select(User).where(User.id == record.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None

    return await create_token_pair(db, user)


async def revoke_refresh_token(db: AsyncSession, raw_refresh: str) -> None:
    token_hash = _hash_token(raw_refresh)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record:
        record.is_revoked = True
        db.add(record)
        await db.commit()
