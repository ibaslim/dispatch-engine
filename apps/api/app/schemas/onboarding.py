from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class ApplicationStatus(str, Enum):
    pre_pending = "pre_pending"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class OnboardingApplicationCreateRequest(BaseModel):
    role: str
    data: dict[str, Any]


class OnboardingApplicationReviewRequest(BaseModel):
    reason: str | None = None


class OnboardingApplicationResponse(BaseModel):
    id: str
    user_id: str
    role: str
    status: ApplicationStatus
    data: dict[str, Any]
    created_at: datetime
    reviewed_at: datetime | None
    reviewed_by_id: str | None
    decision_reason: str | None

