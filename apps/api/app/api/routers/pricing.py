import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.deps import CurrentUser, PlatformAdmin, get_db
from app.models.location import (
    City,
    CityPricing,
    Country,
    GlobalPricing,
    PartnerCityPricing,
    PartnerPricing,
    PartnerStatePricing,
    State,
    StatePricing,
)
from app.models.tenant import Tenant, TenantRole

router = APIRouter()


class Rates(BaseModel):
    partner_price_per_km: float = Field(ge=0)
    partner_price_per_kg: float = Field(ge=0)
    individual_price_per_km: float = Field(ge=0)
    individual_price_per_kg: float = Field(ge=0)


class PartnerRates(BaseModel):
    price_per_km: float = Field(ge=0)
    price_per_kg: float = Field(ge=0)


class PartnerOut(BaseModel):
    id: uuid.UUID
    name: str


class CityPricingOut(Rates):
    city_id: uuid.UUID
    city_name: str


class StatePricingOut(Rates):
    state_id: uuid.UUID
    state_name: str
    cities: List[CityPricingOut]


def _apply_rates(target: GlobalPricing | StatePricing | CityPricing, rates: Rates) -> None:
    target.partner_price_per_km = rates.partner_price_per_km
    target.partner_price_per_kg = rates.partner_price_per_kg
    target.individual_price_per_km = rates.individual_price_per_km
    target.individual_price_per_kg = rates.individual_price_per_kg


def _apply_partner_rates(
    target: PartnerPricing | PartnerStatePricing | PartnerCityPricing,
    rates: PartnerRates,
) -> None:
    target.price_per_km = rates.price_per_km
    target.price_per_kg = rates.price_per_kg


def _rates_for(source: GlobalPricing | StatePricing | CityPricing) -> dict:
    return {
        "partner_price_per_km": source.partner_price_per_km,
        "partner_price_per_kg": source.partner_price_per_kg,
        "individual_price_per_km": source.individual_price_per_km,
        "individual_price_per_kg": source.individual_price_per_kg,
    }


async def _global_pricing(db: AsyncSession) -> GlobalPricing:
    pricing = await db.scalar(select(GlobalPricing).where(GlobalPricing.key == "canada"))
    if pricing is None:
        pricing = GlobalPricing(key="canada")
        db.add(pricing)
        await db.flush()
    return pricing


async def _partner(db: AsyncSession, partner_id: uuid.UUID) -> Tenant:
    partner = await db.scalar(
        select(Tenant).where(
            Tenant.id == partner_id,
            Tenant.role == TenantRole.vendor,
        )
    )
    if partner is None:
        raise HTTPException(status_code=404, detail="Partner not found.")
    return partner


async def _canadian_states(db: AsyncSession) -> list[State]:
    result = await db.execute(
        select(State)
        .join(Country)
        .where(Country.code == "CA")
        .options(
            joinedload(State.pricing),
            selectinload(State.cities).joinedload(City.pricing),
        )
        .order_by(State.name)
    )
    return list(result.scalars().unique().all())


@router.get("/partners", response_model=List[PartnerOut])
async def list_partners(
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tenant)
        .where(Tenant.role == TenantRole.vendor, Tenant.is_active.is_(True))
        .order_by(Tenant.name)
    )
    return [PartnerOut(id=tenant.id, name=tenant.name) for tenant in result.scalars().all()]


@router.get("/defaults", response_model=Rates)
async def get_default_pricing(
    _: CurrentUser,
    partner_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    global_pricing = await _global_pricing(db)
    if partner_id is None:
        return Rates(**_rates_for(global_pricing))

    await _partner(db, partner_id)
    partner_pricing = await db.scalar(
        select(PartnerPricing).where(PartnerPricing.partner_id == partner_id)
    )
    return Rates(
        partner_price_per_km=(
            partner_pricing.price_per_km
            if partner_pricing else global_pricing.partner_price_per_km
        ),
        partner_price_per_kg=(
            partner_pricing.price_per_kg
            if partner_pricing else global_pricing.partner_price_per_kg
        ),
        individual_price_per_km=global_pricing.individual_price_per_km,
        individual_price_per_kg=global_pricing.individual_price_per_kg,
    )


@router.get("/canada", response_model=List[StatePricingOut])
async def list_canadian_pricing(
    _: CurrentUser,
    partner_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    states = await _canadian_states(db)
    global_pricing = await _global_pricing(db)
    partner_default = None
    partner_states: dict[uuid.UUID, PartnerStatePricing] = {}
    partner_cities: dict[uuid.UUID, PartnerCityPricing] = {}

    if partner_id is not None:
        await _partner(db, partner_id)
        partner_default = await db.scalar(
            select(PartnerPricing).where(PartnerPricing.partner_id == partner_id)
        )
        partner_states = {
            row.state_id: row
            for row in (await db.scalars(
                select(PartnerStatePricing).where(
                    PartnerStatePricing.partner_id == partner_id
                )
            )).all()
        }
        partner_cities = {
            row.city_id: row
            for row in (await db.scalars(
                select(PartnerCityPricing).where(
                    PartnerCityPricing.partner_id == partner_id
                )
            )).all()
        }

    response = []
    for state in states:
        state_source = state.pricing or global_pricing
        state_partner_km = state_source.partner_price_per_km
        state_partner_kg = state_source.partner_price_per_kg

        if partner_id is not None:
            state_override = partner_states.get(state.id)
            if state_override:
                state_partner_km = state_override.price_per_km
                state_partner_kg = state_override.price_per_kg
            elif partner_default:
                state_partner_km = partner_default.price_per_km
                state_partner_kg = partner_default.price_per_kg

        cities = []
        for city in sorted(state.cities, key=lambda item: item.name):
            city_source = city.pricing or state_source
            city_partner_km = city_source.partner_price_per_km
            city_partner_kg = city_source.partner_price_per_kg

            if partner_id is not None:
                city_override = partner_cities.get(city.id)
                if city_override:
                    city_partner_km = city_override.price_per_km
                    city_partner_kg = city_override.price_per_kg
                else:
                    city_partner_km = state_partner_km
                    city_partner_kg = state_partner_kg

            cities.append(CityPricingOut(
                city_id=city.id,
                city_name=city.name,
                partner_price_per_km=city_partner_km,
                partner_price_per_kg=city_partner_kg,
                individual_price_per_km=city_source.individual_price_per_km,
                individual_price_per_kg=city_source.individual_price_per_kg,
            ))

        response.append(StatePricingOut(
            state_id=state.id,
            state_name=state.name,
            partner_price_per_km=state_partner_km,
            partner_price_per_kg=state_partner_kg,
            individual_price_per_km=state_source.individual_price_per_km,
            individual_price_per_kg=state_source.individual_price_per_kg,
            cities=cities,
        ))
    return response


@router.put("/defaults")
async def update_default_pricing(
    rates: Rates,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    global_pricing = await _global_pricing(db)
    _apply_rates(global_pricing, rates)
    states = await _canadian_states(db)
    for state in states:
        if state.pricing is None:
            state.pricing = StatePricing(state_id=state.id)
            db.add(state.pricing)
        _apply_rates(state.pricing, rates)
        for city in state.cities:
            if city.pricing is None:
                city.pricing = CityPricing(city_id=city.id)
                db.add(city.pricing)
            _apply_rates(city.pricing, rates)
    await db.commit()
    return {"updated_states": len(states)}


@router.put("/states/{state_id}")
async def update_state_pricing(
    state_id: uuid.UUID,
    rates: Rates,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    state = await db.scalar(
        select(State)
        .join(Country)
        .where(State.id == state_id, Country.code == "CA")
        .options(selectinload(State.cities).joinedload(City.pricing), joinedload(State.pricing))
    )
    if state is None:
        raise HTTPException(status_code=404, detail="Canadian province not found.")

    if state.pricing is None:
        state.pricing = StatePricing(state_id=state.id)
        db.add(state.pricing)
    _apply_rates(state.pricing, rates)
    for city in state.cities:
        if city.pricing is None:
            city.pricing = CityPricing(city_id=city.id)
            db.add(city.pricing)
        _apply_rates(city.pricing, rates)
    await db.commit()
    return {"updated_state": str(state_id), "updated_cities": len(state.cities)}


@router.put("/cities/{city_id}")
async def update_city_pricing(
    city_id: uuid.UUID,
    rates: Rates,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    city = await db.scalar(
        select(City)
        .join(State)
        .join(Country)
        .where(City.id == city_id, Country.code == "CA")
        .options(joinedload(City.pricing))
    )
    if city is None:
        raise HTTPException(status_code=404, detail="Canadian city not found.")
    if city.pricing is None:
        city.pricing = CityPricing(city_id=city.id)
        db.add(city.pricing)
    _apply_rates(city.pricing, rates)
    await db.commit()
    return {"updated_city": str(city_id)}


@router.put("/partners/{partner_id}/defaults")
async def update_partner_default(
    partner_id: uuid.UUID,
    rates: PartnerRates,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _partner(db, partner_id)
    pricing = await db.scalar(
        select(PartnerPricing).where(PartnerPricing.partner_id == partner_id)
    )
    if pricing is None:
        pricing = PartnerPricing(partner_id=partner_id)
        db.add(pricing)
    _apply_partner_rates(pricing, rates)

    state_rows = (await db.scalars(
        select(PartnerStatePricing).where(PartnerStatePricing.partner_id == partner_id)
    )).all()
    city_rows = (await db.scalars(
        select(PartnerCityPricing).where(PartnerCityPricing.partner_id == partner_id)
    )).all()
    for row in [*state_rows, *city_rows]:
        _apply_partner_rates(row, rates)
    await db.commit()
    return {"updated_partner": str(partner_id)}


@router.put("/partners/{partner_id}/states/{state_id}")
async def update_partner_state(
    partner_id: uuid.UUID,
    state_id: uuid.UUID,
    rates: PartnerRates,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _partner(db, partner_id)
    state = await db.scalar(
        select(State)
        .join(Country)
        .where(State.id == state_id, Country.code == "CA")
        .options(selectinload(State.cities))
    )
    if state is None:
        raise HTTPException(status_code=404, detail="Canadian province not found.")

    pricing = await db.scalar(
        select(PartnerStatePricing).where(
            PartnerStatePricing.partner_id == partner_id,
            PartnerStatePricing.state_id == state_id,
        )
    )
    if pricing is None:
        pricing = PartnerStatePricing(partner_id=partner_id, state_id=state_id)
        db.add(pricing)
    _apply_partner_rates(pricing, rates)

    city_rows = (await db.scalars(
        select(PartnerCityPricing).where(
            PartnerCityPricing.partner_id == partner_id,
            PartnerCityPricing.city_id.in_([city.id for city in state.cities]),
        )
    )).all()
    for row in city_rows:
        _apply_partner_rates(row, rates)
    await db.commit()
    return {"updated_state": str(state_id), "updated_cities": len(state.cities)}


@router.put("/partners/{partner_id}/cities/{city_id}")
async def update_partner_city(
    partner_id: uuid.UUID,
    city_id: uuid.UUID,
    rates: PartnerRates,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _partner(db, partner_id)
    city = await db.scalar(
        select(City)
        .join(State)
        .join(Country)
        .where(City.id == city_id, Country.code == "CA")
    )
    if city is None:
        raise HTTPException(status_code=404, detail="Canadian city not found.")

    pricing = await db.scalar(
        select(PartnerCityPricing).where(
            PartnerCityPricing.partner_id == partner_id,
            PartnerCityPricing.city_id == city_id,
        )
    )
    if pricing is None:
        pricing = PartnerCityPricing(partner_id=partner_id, city_id=city_id)
        db.add(pricing)
    _apply_partner_rates(pricing, rates)
    await db.commit()
    return {"updated_city": str(city_id)}
