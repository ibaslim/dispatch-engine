from uuid import UUID
from pydantic import BaseModel, EmailStr


class InviteTenantAdminRequest(BaseModel):
    email: EmailStr
    name: str
    tenant_name: str


class TenantResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    is_active: bool

    model_config = {"from_attributes": True}
