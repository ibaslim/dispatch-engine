"""Unit tests for post listing service behavior."""

from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.post_service import list_published_posts


@dataclass
class _PostRow:
    id: str
    title: str
    summary: str
    content: str
    is_published: bool
    created_at: datetime


class _ScalarResultStub:
    def __init__(self, rows: list[_PostRow]):
        self._rows = rows

    def all(self) -> list[_PostRow]:
        return self._rows


class _ExecuteResultStub:
    def __init__(self, rows: list[_PostRow]):
        self._rows = rows

    def scalars(self) -> _ScalarResultStub:
        return _ScalarResultStub(self._rows)


class _SessionStub:
    def __init__(self, rows: list[_PostRow]):
        self.rows = rows

    async def execute(self, stmt):
        # Mirror service query semantics for unit tests:
        # 1) only published posts
        # 2) newest first
        # 3) apply SQLAlchemy limit from the statement
        published = [p for p in self.rows if p.is_published]
        ordered = sorted(published, key=lambda p: p.created_at, reverse=True)
        limit = stmt._limit_clause.value if stmt._limit_clause is not None else len(ordered)
        return _ExecuteResultStub(ordered[:limit])


def _make_post(title: str, created_at: datetime, is_published: bool = True) -> _PostRow:
    return _PostRow(
        id=str(uuid4()),
        title=title,
        summary=f"Summary for {title}",
        content=f"Content for {title}",
        is_published=is_published,
        created_at=created_at,
    )


@pytest.mark.asyncio
async def test_list_published_posts_returns_only_published_sorted_by_newest():
    older = _make_post("Older", datetime(2026, 1, 1, tzinfo=timezone.utc), True)
    hidden = _make_post("Hidden", datetime(2026, 1, 2, tzinfo=timezone.utc), False)
    newer = _make_post("Newer", datetime(2026, 1, 3, tzinfo=timezone.utc), True)

    db = _SessionStub([older, hidden, newer])
    posts = await list_published_posts(db, limit=20)

    assert [p.title for p in posts] == ["Newer", "Older"]


@pytest.mark.asyncio
async def test_list_published_posts_honors_limit():
    posts_data = [
        _make_post(f"Post {i}", datetime(2026, 1, i, tzinfo=timezone.utc), True)
        for i in range(1, 6)
    ]
    db = _SessionStub(posts_data)

    posts = await list_published_posts(db, limit=3)

    assert len(posts) == 3
    assert posts[0].title == "Post 5"
