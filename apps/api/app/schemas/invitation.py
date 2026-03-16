from pydantic import BaseModel


class AcceptInvitationRequest(BaseModel):
    token: str
    password: str
    name: str | None = None


class InvitationResponse(BaseModel):
    id: str
    email: str
    role: str
    is_used: bool
