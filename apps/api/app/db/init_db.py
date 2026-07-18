from app.db.base import Base
from app.db.session import engine

# import all models so SQLAlchemy registers them
from app.models.order import Order
from app.models.user import User
from app.models.user import UserRole
from app.models.location import (
    City,
    CityPricing,
    Country,
    DriverCityPricing,
    DriverPricing,
    DriverStatePricing,
    GlobalPricing,
    PartnerCityPricing,
    PartnerPricing,
    PartnerStatePricing,
    State,
    StatePricing,
)
from app.models.delivery_configuration import (
    AfterHoursDelivery,
    DeliveryCategory,
    DeliveryPolicy,
    OperationalZone,
    OperationalZoneCity,
    PartnerZoneCategoryPrice,
    SpecialOccasion,
    Surcharge,
    ZoneBasePrice,
    ZoneCategoryPrice,
)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
