"""Add posts table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-19 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    posts = op.create_table(
        "posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.bulk_insert(
        posts,
        [
            {
                "id": "ea6093f8-7d79-4a17-a3ab-6c79670617e8",
                "title": "Welcome to Dispatch Engine",
                "summary": "A shared demo post seeded for local development.",
                "content": "This post demonstrates an end-to-end fullstack feature across API, shared contracts, web, and mobile.",
                "is_published": True,
            },
            {
                "id": "11ed283d-52d8-4f35-94ee-a82740f4c4bd",
                "title": "How to Add a Fullstack Feature",
                "summary": "Start at API, then shared contracts, then all clients.",
                "content": "Implement backend model and endpoint first, add DTO in libs/shared/contracts, then consume in dispatcher-web, tracking-web, and driver-mobile.",
                "is_published": True,
            },
            {
                "id": "fb6f8f8f-1900-4fe8-8a81-8f6f4ed91b35",
                "title": "Developer Experience Matters",
                "summary": "The stack is optimized for git clone + docker compose up -d.",
                "content": "For backend and web, Docker handles dependencies and startup. For mobile, install once in apps/driver-mobile and run Expo on host.",
                "is_published": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("posts")
