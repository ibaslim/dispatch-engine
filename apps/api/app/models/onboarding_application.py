import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.user import RoleEnum


class ApplicationStatus(str, enum.Enum):
    pre_pending = "pre_pending"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class OnboardingApplication(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "onboarding_applications"

    user_id: Mapped[PG_UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        SAEnum(RoleEnum, name="role_enum"),
        nullable=False,
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus, name="onboarding_status_enum"),
        nullable=False,
        default=ApplicationStatus.pending,
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_id: Mapped[PG_UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    decision_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])

