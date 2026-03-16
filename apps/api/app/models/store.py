import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.user import UserStoreAccess


class Store(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "stores"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="stores")
    user_accesses: Mapped[List["UserStoreAccess"]] = relationship(
        "UserStoreAccess", back_populates="store"
    )

    def __repr__(self) -> str:
        return f"<Store id={self.id} name={self.name!r} tenant_id={self.tenant_id}>"
