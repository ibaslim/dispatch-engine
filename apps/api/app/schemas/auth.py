from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: str  # plain str — login is a DB lookup, strict domain validation is unnecessary
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class PushTokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=500)
    platform: str = Field(default="android", pattern="^(android|ios)$")

class PendingApprovalResponse(BaseModel):
    """Response when user exists but has pending onboarding or approval."""
    status: str
    message: str
    role: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None


class SuspendedAccountResponse(BaseModel):
    status: str
    message: str
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
    tenant_is_active: bool | None = None
    tenant_role: str | None = None
    roles: list[str]


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
