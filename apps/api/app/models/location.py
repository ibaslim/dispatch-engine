import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base import Base, TimestampMixin, UUIDMixin

DEFAULT_DRIVER_BASE_SALARY = 200.0
DEFAULT_DRIVER_COMMISSION_PER_DELIVERY = 0.0


class Country(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "countries"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)

    states: Mapped[List["State"]] = relationship(
        "State", back_populates="country", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Country name={self.name!r} code={self.code!r}>"


class State(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "states"
    __table_args__ = (UniqueConstraint("name", "country_id", name="uq_state_country"),)

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    country_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("countries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    country: Mapped["Country"] = relationship("Country", back_populates="states")
    cities: Mapped[List["City"]] = relationship(
        "City", back_populates="state", cascade="all, delete-orphan"
    )
    pricing: Mapped[Optional["StatePricing"]] = relationship(
        "StatePricing", back_populates="state", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<State name={self.name!r}>"


class City(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint("name", "state_id", name="uq_city_state"),)

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    state_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("states.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    state: Mapped["State"] = relationship("State", back_populates="cities")
    pricing: Mapped[Optional["CityPricing"]] = relationship(
        "CityPricing", back_populates="city", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<City name={self.name!r}>"


class CityPricing(Base, UUIDMixin, TimestampMixin):
    """Pricing config per city – separate rates for partners and individual clients."""
    __tablename__ = "city_pricing"

    city_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("cities.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Partner rates
    partner_price_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    partner_price_per_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Individual client rates
    individual_price_per_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    individual_price_per_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    city: Mapped["City"] = relationship("City", back_populates="pricing")

    def __repr__(self) -> str:
        return f"<CityPricing city_id={self.city_id}>"


class StatePricing(Base, UUIDMixin, TimestampMixin):
    """Default pricing applied to every city in a state or province."""
    __tablename__ = "state_pricing"

    state_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("states.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    partner_price_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    partner_price_per_kg: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    individual_price_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    individual_price_per_kg: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)

    state: Mapped["State"] = relationship("State", back_populates="pricing")

    def __repr__(self) -> str:
        return f"<StatePricing state_id={self.state_id}>"


class GlobalPricing(Base, UUIDMixin, TimestampMixin):
    """National default rates used before province and city overrides."""
    __tablename__ = "global_pricing"

    key: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, default="canada")
    partner_price_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    partner_price_per_kg: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    individual_price_per_km: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    individual_price_per_kg: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)


class PartnerPricing(Base, UUIDMixin, TimestampMixin):
    """National partner-specific rates."""
    __tablename__ = "partner_pricing"

    partner_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    price_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kg: Mapped[float] = mapped_column(Float, nullable=False)


class PartnerStatePricing(Base, UUIDMixin, TimestampMixin):
    """Partner-specific province rates."""
    __tablename__ = "partner_state_pricing"
    __table_args__ = (
        UniqueConstraint("partner_id", "state_id", name="uq_partner_state_pricing"),
    )

    partner_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("states.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kg: Mapped[float] = mapped_column(Float, nullable=False)


class PartnerCityPricing(Base, UUIDMixin, TimestampMixin):
    """Partner-specific city rates."""
    __tablename__ = "partner_city_pricing"
    __table_args__ = (
        UniqueConstraint("partner_id", "city_id", name="uq_partner_city_pricing"),
    )

    partner_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    city_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("cities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price_per_km: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kg: Mapped[float] = mapped_column(Float, nullable=False)


class DriverPricing(Base, UUIDMixin, TimestampMixin):
    """National driver-specific payroll compensation."""
    __tablename__ = "driver_pricing"

    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    base_salary: Mapped[float] = mapped_column(
        Float, nullable=False, default=DEFAULT_DRIVER_BASE_SALARY
    )
    commission_per_delivery: Mapped[float] = mapped_column(
        Float, nullable=False, default=DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
    )


class DriverStatePricing(Base, UUIDMixin, TimestampMixin):
    """Driver-specific province payroll compensation."""
    __tablename__ = "driver_state_pricing"
    __table_args__ = (
        UniqueConstraint("driver_id", "state_id", name="uq_driver_state_pricing"),
    )

    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("states.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    base_salary: Mapped[float] = mapped_column(
        Float, nullable=False, default=DEFAULT_DRIVER_BASE_SALARY
    )
    commission_per_delivery: Mapped[float] = mapped_column(
        Float, nullable=False, default=DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
    )


class DriverCityPricing(Base, UUIDMixin, TimestampMixin):
    """Driver-specific city payroll compensation."""
    __tablename__ = "driver_city_pricing"
    __table_args__ = (
        UniqueConstraint("driver_id", "city_id", name="uq_driver_city_pricing"),
    )

    driver_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    city_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("cities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    base_salary: Mapped[float] = mapped_column(
        Float, nullable=False, default=DEFAULT_DRIVER_BASE_SALARY
    )
    commission_per_delivery: Mapped[float] = mapped_column(
        Float, nullable=False, default=DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
    )
