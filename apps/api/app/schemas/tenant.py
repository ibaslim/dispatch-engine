from uuid import UUID
from pydantic import BaseModel, EmailStr


class InviteTenantAdminRequest(BaseModel):
    email: EmailStr
    name: str
    tenant_name: str


class InviteTenantUserRequest(BaseModel):
    email: EmailStr
    role: str


class TenantResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    is_active: bool
    contact_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone_country_code: str | None = None
    contact_phone_number: str | None = None
    address: str | None = None
    ntn_number: str | None = None
    notes: str | None = None
    national_id_file_name: str | None = None

    model_config = {"from_attributes": True}
