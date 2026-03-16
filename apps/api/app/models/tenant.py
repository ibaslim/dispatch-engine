import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.store import Store
    from app.models.user import User


class Tenant(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    stores: Mapped[List["Store"]] = relationship("Store", back_populates="tenant")
    users: Mapped[List["User"]] = relationship("User", back_populates="tenant")

    def __repr__(self) -> str:
        return f"<Tenant id={self.id} name={self.name!r}>"
