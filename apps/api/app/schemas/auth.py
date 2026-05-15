from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str  # plain str — login is a DB lookup, strict domain validation is unnecessary
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class PendingApprovalResponse(BaseModel):
    """Response when user exists but has pending onboarding or approval."""
    status: str
    message: str
    role: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class MeResponse(BaseModel):
    id: str
    email: str
    name: str
    is_platform_admin: bool
    tenant_id: str | None
    roles: list[str]


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
