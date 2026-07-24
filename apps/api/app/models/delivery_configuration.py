import uuid
from datetime import date, time
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class OperationalZone(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "operational_zones"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    radius_km: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=Decimal("30.00")
    )
    cities: Mapped[List["OperationalZoneCity"]] = relationship(
        "OperationalZoneCity", back_populates="zone", cascade="all, delete-orphan"
    )
    base_price: Mapped[Optional["ZoneBasePrice"]] = relationship(
        "ZoneBasePrice", back_populates="zone", cascade="all, delete-orphan", uselist=False
    )
    category_prices: Mapped[List["ZoneCategoryPrice"]] = relationship(
        "ZoneCategoryPrice", back_populates="zone", cascade="all, delete-orphan"
    )


class DeliveryPolicy(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "delivery_policies"

    key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, default="default")
    allow_intercity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_tax_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )


class OperationalZoneCity(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "operational_zone_cities"
    __table_args__ = (UniqueConstraint("city_id", name="uq_operational_zone_city"),)

    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("operational_zones.id", ondelete="CASCADE"), index=True
    )
    city_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("cities.id", ondelete="CASCADE"), index=True
    )
    zone: Mapped["OperationalZone"] = relationship("OperationalZone", back_populates="cities")
    city = relationship("City")


class DeliveryCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "delivery_categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    zone_prices: Mapped[List["ZoneCategoryPrice"]] = relationship(
        "ZoneCategoryPrice", back_populates="category", cascade="all, delete-orphan"
    )


class AfterHoursDelivery(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "after_hours_deliveries"

    start_time: Mapped[time] = mapped_column(Time(), nullable=False)
    end_time: Mapped[time] = mapped_column(Time(), nullable=False)
    extra_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)


class ZoneBasePrice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "zone_base_prices"

    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("operational_zones.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    individual_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    partner_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    zone: Mapped["OperationalZone"] = relationship("OperationalZone", back_populates="base_price")


class ZoneCategoryPrice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "zone_category_prices"
    __table_args__ = (
        UniqueConstraint("zone_id", "category_id", name="uq_zone_category_price"),
    )

    zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("operational_zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    individual_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    partner_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    individual_out_of_radius_per_km: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    partner_out_of_radius_per_km: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    zone: Mapped["OperationalZone"] = relationship(
        "OperationalZone", back_populates="category_prices"
    )
    category: Mapped["DeliveryCategory"] = relationship(
        "DeliveryCategory", back_populates="zone_prices"
    )
    partner_overrides: Mapped[List["PartnerZoneCategoryPrice"]] = relationship(
        "PartnerZoneCategoryPrice",
        back_populates="zone_category_price",
        cascade="all, delete-orphan",
    )


class PartnerZoneCategoryPrice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_zone_category_prices"
    __table_args__ = (
        UniqueConstraint(
            "zone_category_price_id",
            "partner_id",
            name="uq_partner_zone_category_price",
        ),
    )

    zone_category_price_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("zone_category_prices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    out_of_radius_per_km: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    zone_category_price: Mapped["ZoneCategoryPrice"] = relationship(
        "ZoneCategoryPrice", back_populates="partner_overrides"
    )
    partner = relationship("Tenant")


class Surcharge(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "surcharges"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    extra_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)


class SpecialOccasion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "special_occasions"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    occasion_date: Mapped[date] = mapped_column(Date(), nullable=False)
    repeats_annually: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    extra_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
