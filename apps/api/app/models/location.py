import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.db.base import Base, TimestampMixin, UUIDMixin


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
