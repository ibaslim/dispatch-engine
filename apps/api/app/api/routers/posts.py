from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.schemas.post import PostResponse
from app.services.post_service import list_published_posts

router = APIRouter()


@router.get("", response_model=List[PostResponse])
async def get_posts(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
):
    posts = await list_published_posts(db, limit=limit)
    return [
        PostResponse(
            id=p.id,
            title=p.title,
            summary=p.summary,
            content=p.content,
            is_published=p.is_published,
            created_at=p.created_at.isoformat(),
        )
        for p in posts
    ]
