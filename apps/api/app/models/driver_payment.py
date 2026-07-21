import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class DriverPaymentGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "driver_payment_groups"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    rule_type: Mapped[str] = mapped_column(String(24), nullable=False)
    fixed_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    delivery_fee_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    platform_tip_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )

    assignments: Mapped[list["DriverPaymentGroupAssignment"]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
    )


class DriverPaymentGroupAssignment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "driver_payment_group_assignments"
    __table_args__ = (
        UniqueConstraint("driver_id", name="uq_driver_payment_group_driver"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("driver_payment_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    group: Mapped[DriverPaymentGroup] = relationship(back_populates="assignments")
    driver = relationship("Tenant")
