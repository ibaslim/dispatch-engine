from uuid import UUID

from pydantic import BaseModel


class PostResponse(BaseModel):
    id: UUID
    title: str
    summary: str
    content: str
    is_published: bool
    created_at: str
