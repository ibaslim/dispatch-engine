import uuid
from datetime import date, time
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.deps import PlatformAdmin, get_db
from app.models.delivery_configuration import (
    AfterHoursDelivery,
    DeliveryCategory,
    OperationalZone,
    OperationalZoneCity,
    PartnerZoneCategoryPrice,
    SpecialOccasion,
    Surcharge,
    ZoneCategoryPrice,
)
from app.models.location import City
from app.models.tenant import Tenant, TenantRole

router = APIRouter()
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
Distance = Annotated[Decimal, Field(gt=0, max_digits=8, decimal_places=2)]


class ZoneInput(BaseModel):
    name: Name
    city_ids: list[uuid.UUID] = Field(min_length=1)


class ZoneCityOut(BaseModel):
    id: uuid.UUID
    name: str
    state_id: uuid.UUID
    state_name: str


class ZoneOut(BaseModel):
    id: uuid.UUID
    name: str
    radius_km: Distance
    cities: list[ZoneCityOut]


class CategoryInput(BaseModel):
    name: Name
    description: Description


class CategoryOut(CategoryInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class AfterHoursInput(BaseModel):
    start_time: time
    end_time: time
    extra_amount: Money

    @model_validator(mode="after")
    def times_must_differ(self):
        if self.start_time == self.end_time:
            raise ValueError("Start and end time must be different.")
        return self


class AfterHoursOut(AfterHoursInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class BasePriceInput(BaseModel):
    individual_price: Money
    partner_price: Money
    individual_out_of_radius_per_km: Money
    partner_out_of_radius_per_km: Money


class PartnerPriceOverrideOut(BaseModel):
    id: uuid.UUID
    partner_id: uuid.UUID
    partner_name: str
    price: Money
    out_of_radius_per_km: Money


class BasePriceOut(BasePriceInput):
    id: uuid.UUID
    zone_id: uuid.UUID
    zone_name: str
    category_id: uuid.UUID
    category_name: str
    partner_overrides: list[PartnerPriceOverrideOut]


class SurchargeInput(BaseModel):
    name: Name
    extra_amount: Money


class SurchargeOut(SurchargeInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class SpecialOccasionInput(BaseModel):
    name: Name
    occasion_date: date
    repeats_annually: bool = False


class SpecialOccasionOut(SpecialOccasionInput):
    id: uuid.UUID
    model_config = {"from_attributes": True}


async def _named_conflict(
    db: AsyncSession, model, name: str, excluding_id: uuid.UUID | None = None
) -> None:
    statement = select(model.id).where(model.name.ilike(name))
    if excluding_id:
        statement = statement.where(model.id != excluding_id)
    if await db.scalar(statement):
        raise HTTPException(status_code=409, detail=f'"{name}" already exists.')


async def _entity(db: AsyncSession, model, entity_id: uuid.UUID, label: str):
    entity = await db.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"{label} not found.")
    return entity


def _base_price_out(item: ZoneCategoryPrice) -> BasePriceOut:
    return BasePriceOut(
        id=item.id,
        zone_id=item.zone_id,
        zone_name=item.zone.name,
        category_id=item.category_id,
        category_name=item.category.name,
        individual_price=item.individual_price,
        partner_price=item.partner_price,
        individual_out_of_radius_per_km=item.individual_out_of_radius_per_km,
        partner_out_of_radius_per_km=item.partner_out_of_radius_per_km,
        partner_overrides=[
            PartnerPriceOverrideOut(
                id=override.id,
                partner_id=override.partner_id,
                partner_name=override.partner.name,
                price=override.price,
                out_of_radius_per_km=override.out_of_radius_per_km,
            )
            for override in sorted(
                item.partner_overrides, key=lambda value: value.partner.name.lower()
            )
        ],
    )


def _zone_out(zone: OperationalZone) -> ZoneOut:
    return ZoneOut(
        id=zone.id,
        name=zone.name,
        radius_km=zone.radius_km,
        cities=[
            ZoneCityOut(
                id=item.city.id,
                name=item.city.name,
                state_id=item.city.state_id,
                state_name=item.city.state.name,
            )
            for item in sorted(zone.cities, key=lambda value: value.city.name)
        ],
    )


async def _zone(db: AsyncSession, zone_id: uuid.UUID) -> OperationalZone:
    result = await db.execute(
        select(OperationalZone)
        .where(OperationalZone.id == zone_id)
        .options(
            selectinload(OperationalZone.cities)
            .joinedload(OperationalZoneCity.city)
            .joinedload(City.state)
        )
    )
    zone = result.scalar_one_or_none()
    if zone is None:
        raise HTTPException(status_code=404, detail="Operational zone not found.")
    return zone


async def _validate_zone_cities(
    db: AsyncSession, city_ids: list[uuid.UUID], zone_id: uuid.UUID | None = None
) -> list[City]:
    unique_ids = list(dict.fromkeys(city_ids))
    cities = list((await db.scalars(select(City).where(City.id.in_(unique_ids)))).all())
    if len(cities) != len(unique_ids):
        raise HTTPException(status_code=400, detail="One or more selected cities do not exist.")
    conflict = select(OperationalZoneCity).where(OperationalZoneCity.city_id.in_(unique_ids))
    if zone_id:
        conflict = conflict.where(OperationalZoneCity.zone_id != zone_id)
    assigned = (await db.scalars(conflict.options(joinedload(OperationalZoneCity.city)))).first()
    if assigned:
        raise HTTPException(
            status_code=409,
            detail=f"{assigned.city.name} already belongs to another operational zone.",
        )
    return cities


@router.get("/operational-zones", response_model=list[ZoneOut])
async def list_zones(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OperationalZone)
        .options(
            selectinload(OperationalZone.cities)
            .joinedload(OperationalZoneCity.city)
            .joinedload(City.state)
        )
        .order_by(OperationalZone.name)
    )
    return [_zone_out(zone) for zone in result.scalars().unique().all()]


@router.post("/operational-zones", response_model=ZoneOut, status_code=status.HTTP_201_CREATED)
async def create_zone(payload: ZoneInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    await _named_conflict(db, OperationalZone, payload.name)
    cities = await _validate_zone_cities(db, payload.city_ids)
    zone = OperationalZone(name=payload.name)
    zone.cities = [OperationalZoneCity(city_id=city.id, city=city) for city in cities]
    db.add(zone)
    await db.commit()
    return _zone_out(await _zone(db, zone.id))


@router.put("/operational-zones/{zone_id}", response_model=ZoneOut)
async def update_zone(
    zone_id: uuid.UUID, payload: ZoneInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    zone = await _zone(db, zone_id)
    await _named_conflict(db, OperationalZone, payload.name, zone_id)
    cities = await _validate_zone_cities(db, payload.city_ids, zone_id)
    zone.name = payload.name
    requested_ids = {city.id for city in cities}
    current_ids = {item.city_id for item in zone.cities}
    zone.cities[:] = [item for item in zone.cities if item.city_id in requested_ids]
    zone.cities.extend(
        OperationalZoneCity(city_id=city.id, city=city)
        for city in cities
        if city.id not in current_ids
    )
    await db.commit()
    return _zone_out(await _zone(db, zone.id))


@router.delete("/operational-zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(zone_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    zone = await _entity(db, OperationalZone, zone_id, "Operational zone")
    await db.delete(zone)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/delivery-categories", response_model=list[CategoryOut])
async def list_categories(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(DeliveryCategory).order_by(DeliveryCategory.name))).all()


@router.post("/delivery-categories", response_model=CategoryOut, status_code=201)
async def create_category(payload: CategoryInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    await _named_conflict(db, DeliveryCategory, payload.name)
    item = DeliveryCategory(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/delivery-categories/{item_id}", response_model=CategoryOut)
async def update_category(
    item_id: uuid.UUID, payload: CategoryInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = await _entity(db, DeliveryCategory, item_id, "Delivery category")
    await _named_conflict(db, DeliveryCategory, payload.name, item_id)
    item.name, item.description = payload.name, payload.description
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/delivery-categories/{item_id}", status_code=204)
async def delete_category(item_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    await db.delete(await _entity(db, DeliveryCategory, item_id, "Delivery category"))
    await db.commit()
    return Response(status_code=204)


@router.get("/after-hours", response_model=list[AfterHoursOut])
async def list_after_hours(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(AfterHoursDelivery).order_by(AfterHoursDelivery.start_time))).all()


@router.post("/after-hours", response_model=AfterHoursOut, status_code=201)
async def create_after_hours(
    payload: AfterHoursInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = AfterHoursDelivery(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/after-hours/{item_id}", response_model=AfterHoursOut)
async def update_after_hours(
    item_id: uuid.UUID, payload: AfterHoursInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = await _entity(db, AfterHoursDelivery, item_id, "After-hours range")
    item.start_time, item.end_time, item.extra_amount = (
        payload.start_time,
        payload.end_time,
        payload.extra_amount,
    )
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/after-hours/{item_id}", status_code=204)
async def delete_after_hours(item_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    await db.delete(await _entity(db, AfterHoursDelivery, item_id, "After-hours range"))
    await db.commit()
    return Response(status_code=204)


@router.get("/base-prices", response_model=list[BasePriceOut])
async def list_base_prices(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ZoneCategoryPrice)
        .options(
            joinedload(ZoneCategoryPrice.zone),
            joinedload(ZoneCategoryPrice.category),
            selectinload(ZoneCategoryPrice.partner_overrides).joinedload(
                PartnerZoneCategoryPrice.partner
            ),
        )
        .join(OperationalZone)
        .join(DeliveryCategory)
        .order_by(OperationalZone.name, DeliveryCategory.name)
    )
    return [_base_price_out(item) for item in result.scalars().unique().all()]


@router.put("/base-prices/{zone_id}/{category_id}", response_model=BasePriceOut)
async def upsert_base_price(
    zone_id: uuid.UUID,
    category_id: uuid.UUID,
    payload: BasePriceInput,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _entity(db, OperationalZone, zone_id, "Operational zone")
    await _entity(db, DeliveryCategory, category_id, "Delivery category")
    item = await db.scalar(
        select(ZoneCategoryPrice).where(
            ZoneCategoryPrice.zone_id == zone_id,
            ZoneCategoryPrice.category_id == category_id,
        )
    )
    if item is None:
        item = ZoneCategoryPrice(zone_id=zone_id, category_id=category_id)
        db.add(item)
    item.individual_price = payload.individual_price
    item.partner_price = payload.partner_price
    item.individual_out_of_radius_per_km = (
        payload.individual_out_of_radius_per_km
    )
    item.partner_out_of_radius_per_km = payload.partner_out_of_radius_per_km
    await db.commit()
    loaded = await db.scalar(
        select(ZoneCategoryPrice)
        .where(ZoneCategoryPrice.id == item.id)
        .options(
            joinedload(ZoneCategoryPrice.zone),
            joinedload(ZoneCategoryPrice.category),
            selectinload(ZoneCategoryPrice.partner_overrides).joinedload(
                PartnerZoneCategoryPrice.partner
            ),
        )
    )
    return _base_price_out(loaded)


class ZoneRadiusInput(BaseModel):
    radius_km: Distance


@router.put("/base-prices/zones/{zone_id}/radius", response_model=ZoneRadiusInput)
async def update_zone_radius(
    zone_id: uuid.UUID,
    payload: ZoneRadiusInput,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    zone = await _entity(db, OperationalZone, zone_id, "Operational zone")
    zone.radius_km = payload.radius_km
    await db.commit()
    return payload


class PartnerPriceInput(BaseModel):
    price: Money
    out_of_radius_per_km: Money


@router.put(
    "/base-prices/{base_price_id}/partner-overrides/{partner_id}",
    response_model=PartnerPriceOverrideOut,
)
async def upsert_partner_price_override(
    base_price_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: PartnerPriceInput,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _entity(db, ZoneCategoryPrice, base_price_id, "Zone/category base price")
    partner = await db.scalar(
        select(Tenant).where(
            Tenant.id == partner_id,
            Tenant.role == TenantRole.vendor,
            Tenant.is_active.is_(True),
        )
    )
    if partner is None:
        raise HTTPException(status_code=404, detail="Active partner not found.")
    item = await db.scalar(
        select(PartnerZoneCategoryPrice).where(
            PartnerZoneCategoryPrice.zone_category_price_id == base_price_id,
            PartnerZoneCategoryPrice.partner_id == partner_id,
        )
    )
    if item is None:
        item = PartnerZoneCategoryPrice(
            zone_category_price_id=base_price_id, partner_id=partner_id
        )
        db.add(item)
    item.price = payload.price
    item.out_of_radius_per_km = payload.out_of_radius_per_km
    await db.commit()
    await db.refresh(item)
    return PartnerPriceOverrideOut(
        id=item.id,
        partner_id=partner.id,
        partner_name=partner.name,
        price=item.price,
        out_of_radius_per_km=item.out_of_radius_per_km,
    )


@router.delete(
    "/base-prices/{base_price_id}/partner-overrides/{partner_id}",
    status_code=204,
)
async def delete_partner_price_override(
    base_price_id: uuid.UUID,
    partner_id: uuid.UUID,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    item = await db.scalar(
        select(PartnerZoneCategoryPrice).where(
            PartnerZoneCategoryPrice.zone_category_price_id == base_price_id,
            PartnerZoneCategoryPrice.partner_id == partner_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Partner price override not found.")
    await db.delete(item)
    await db.commit()
    return Response(status_code=204)


@router.get("/surcharges", response_model=list[SurchargeOut])
async def list_surcharges(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Surcharge).order_by(Surcharge.name))).all()


@router.post("/surcharges", response_model=SurchargeOut, status_code=201)
async def create_surcharge(payload: SurchargeInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    await _named_conflict(db, Surcharge, payload.name)
    item = Surcharge(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/surcharges/{item_id}", response_model=SurchargeOut)
async def update_surcharge(
    item_id: uuid.UUID, payload: SurchargeInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = await _entity(db, Surcharge, item_id, "Surcharge")
    await _named_conflict(db, Surcharge, payload.name, item_id)
    item.name, item.extra_amount = payload.name, payload.extra_amount
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/surcharges/{item_id}", status_code=204)
async def delete_surcharge(item_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    await db.delete(await _entity(db, Surcharge, item_id, "Surcharge"))
    await db.commit()
    return Response(status_code=204)


@router.get("/special-occasions", response_model=list[SpecialOccasionOut])
async def list_special_occasions(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    return (
        await db.scalars(select(SpecialOccasion).order_by(SpecialOccasion.occasion_date, SpecialOccasion.name))
    ).all()


@router.post("/special-occasions", response_model=SpecialOccasionOut, status_code=201)
async def create_special_occasion(
    payload: SpecialOccasionInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = SpecialOccasion(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/special-occasions/{item_id}", response_model=SpecialOccasionOut)
async def update_special_occasion(
    item_id: uuid.UUID,
    payload: SpecialOccasionInput,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    item = await _entity(db, SpecialOccasion, item_id, "Special occasion")
    item.name = payload.name
    item.occasion_date = payload.occasion_date
    item.repeats_annually = payload.repeats_annually
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/special-occasions/{item_id}", status_code=204)
async def delete_special_occasion(
    item_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    await db.delete(await _entity(db, SpecialOccasion, item_id, "Special occasion"))
    await db.commit()
    return Response(status_code=204)
