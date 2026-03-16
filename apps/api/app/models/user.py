import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import enum

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.store import Store
    from app.models.token import RefreshToken, PushToken


class RoleEnum(str, enum.Enum):
    platform_admin = "platform_admin"
    tenant_admin = "tenant_admin"
    central_dispatcher = "central_dispatcher"
    store_dispatcher = "store_dispatcher"
    driver = "driver"


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    tenant: Mapped[Optional["Tenant"]] = relationship("Tenant", back_populates="users")
    roles: Mapped[List["UserRole"]] = relationship(
        "UserRole", back_populates="user", cascade="all, delete-orphan"
    )
    store_accesses: Mapped[List["UserStoreAccess"]] = relationship(
        "UserStoreAccess", back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[List["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
    push_tokens: Mapped[List["PushToken"]] = relationship(
        "PushToken", back_populates="user", cascade="all, delete-orphan"
    )

    def has_role(self, role: str) -> bool:
        return any(r.role == role for r in self.roles)

    def get_accessible_store_ids(self) -> List[uuid.UUID]:
        """Return store IDs this user can access (empty = all stores in tenant)."""
        return [sa.store_id for sa in self.store_accesses]

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class UserRole(Base, TimestampMixin):
    __tablename__ = "user_roles"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        SAEnum(RoleEnum, name="role_enum"),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="roles")


class UserStoreAccess(Base, TimestampMixin):
    """Maps store_dispatcher users to specific stores they can access."""
    __tablename__ = "user_store_access"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stores.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="store_accesses")
    store: Mapped["Store"] = relationship("Store", back_populates="user_accesses")
