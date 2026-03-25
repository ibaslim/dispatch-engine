from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post


async def list_published_posts(db: AsyncSession, limit: int = 20) -> Sequence[Post]:
    stmt = (
        select(Post)
        .where(Post.is_published.is_(True))
        .order_by(Post.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
