import uuid

from pydantic import BaseModel


class DriverProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    contact_name: str | None
    contact_email: str | None
    contact_phone_country_code: str | None
    contact_phone_number: str | None
    address: str | None
    notes: str | None
    rating: float = 0
    vehicle_type: str | None = None
    plate_number: str | None = None
    is_online: bool = False
    completed_deliveries: int = 0
    payment_group_id: uuid.UUID | None = None
    payment_group_name: str | None = None
    payment_rule_type: str | None = None