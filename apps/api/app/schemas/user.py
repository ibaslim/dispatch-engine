from uuid import UUID
from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    is_active: bool
    tenant_id: UUID | None
    roles: list[str]

    model_config = {"from_attributes": True}
