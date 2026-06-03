from typing import TYPE_CHECKING, List
from enum import Enum

from sqlalchemy import String, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.store import Store
    from app.models.user import User


class TenantRole(str, Enum):
    """Role/type of a tenant organization."""
    vendor = "vendor"
    driver = "driver"
    individual = "individual"


class Tenant(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    username: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[str | None] = mapped_column(
        SAEnum(TenantRole, name="tenant_role_enum"),
        nullable=True,
    )
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone_country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    contact_phone_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ntn_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    national_id_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationships
    stores: Mapped[List["Store"]] = relationship("Store", back_populates="tenant")
    users: Mapped[List["User"]] = relationship("User", back_populates="tenant")

    def __repr__(self) -> str:
        return f"<Tenant id={self.id} name={self.name!r}>"
