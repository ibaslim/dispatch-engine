import uuid
from typing import Optional
from datetime import datetime

from sqlalchemy import String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base import Base, TimestampMixin, UUIDMixin


class Invitation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "invitations"

    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    tenant_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    invited_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def is_valid(self) -> bool:
        """Return True if invitation can still be accepted."""
        from datetime import timezone
        now = datetime.now(timezone.utc)
        return not self.is_used and self.expires_at > now

    def __repr__(self) -> str:
        return f"<Invitation id={self.id} email={self.email!r} used={self.is_used}>"
