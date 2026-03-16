from uuid import UUID
from pydantic import BaseModel


class CreateStoreRequest(BaseModel):
    name: str
    address: str | None = None


class StoreResponse(BaseModel):
    id: UUID
    name: str
    tenant_id: UUID
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}
