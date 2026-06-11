import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, PlatformAdmin, get_db
from app.models.location import (
    City,
    Country,
    DriverCityPricing,
    DriverPricing,
    DriverStatePricing,
    DEFAULT_DRIVER_BASE_SALARY,
    DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
    State,
)
from app.models.tenant import Tenant, TenantRole

router = APIRouter()


class DriverCompensation(BaseModel):
    base_salary: float = Field(default=DEFAULT_DRIVER_BASE_SALARY, ge=0)
    commission_per_delivery: float = Field(
        default=DEFAULT_DRIVER_COMMISSION_PER_DELIVERY,
        ge=0,
    )


class DriverOut(BaseModel):
    id: uuid.UUID
    name: str


class DriverCityPayrollOut(DriverCompensation):
    city_id: uuid.UUID
    city_name: str


class DriverStatePayrollOut(DriverCompensation):
    state_id: uuid.UUID
    state_name: str
    cities: List[DriverCityPayrollOut]


def _apply_driver_compensation(
    target: DriverPricing | DriverStatePricing | DriverCityPricing,
    compensation: DriverCompensation,
) -> None:
    target.base_salary = compensation.base_salary
    target.commission_per_delivery = compensation.commission_per_delivery


async def _driver(db: AsyncSession, driver_id: uuid.UUID) -> Tenant:
    driver = await db.scalar(
        select(Tenant).where(
            Tenant.id == driver_id,
            Tenant.role == TenantRole.driver,
        )
    )
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found.")
    return driver


async def _canadian_states(db: AsyncSession) -> list[State]:
    result = await db.execute(
        select(State)
        .join(Country)
        .where(Country.code == "CA")
        .options(selectinload(State.cities))
        .order_by(State.name)
    )
    return list(result.scalars().unique().all())


@router.get("/drivers", response_model=List[DriverOut])
async def list_drivers(
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tenant)
        .where(Tenant.role == TenantRole.driver, Tenant.is_active.is_(True))
        .order_by(Tenant.name)
    )
    return [DriverOut(id=driver.id, name=driver.name) for driver in result.scalars().all()]


@router.get("/drivers/{driver_id}/defaults", response_model=DriverCompensation)
async def get_driver_default(
    driver_id: uuid.UUID,
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _driver(db, driver_id)
    pricing = await db.scalar(
        select(DriverPricing).where(DriverPricing.driver_id == driver_id)
    )
    return DriverCompensation(
        base_salary=(
            pricing.base_salary if pricing else DEFAULT_DRIVER_BASE_SALARY
        ),
        commission_per_delivery=(
            pricing.commission_per_delivery
            if pricing else DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
        ),
    )


@router.get("/drivers/{driver_id}/canada", response_model=List[DriverStatePayrollOut])
async def list_driver_payroll(
    driver_id: uuid.UUID,
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await _driver(db, driver_id)
    states = await _canadian_states(db)
    driver_default = await db.scalar(
        select(DriverPricing).where(DriverPricing.driver_id == driver_id)
    )
    default_salary = (
        driver_default.base_salary
        if driver_default else DEFAULT_DRIVER_BASE_SALARY
    )
    default_commission = (
        driver_default.commission_per_delivery
        if driver_default else DEFAULT_DRIVER_COMMISSION_PER_DELIVERY
    )
    state_rows = {
        row.state_id: row
        for row in (await db.scalars(
            select(DriverStatePricing).where(DriverStatePricing.driver_id == driver_id)
        )).all()
    }
    city_rows = {
        row.city_id: row
        for row in (await db.scalars(
            select(DriverCityPricing).where(DriverCityPricing.driver_id == driver_id)
        )).all()
    }

    response = []
    for state in states:
        state_rate = state_rows.get(state.id)
        state_salary = state_rate.base_salary if state_rate else default_salary
        state_commission = (
            state_rate.commission_per_delivery if state_rate else default_commission
        )
        cities = []
        for city in sorted(state.cities, key=lambda item: item.name):
            city_rate = city_rows.get(city.id)
            cities.append(DriverCityPayrollOut(
                city_id=city.id,
                city_name=city.name,
                base_salary=city_rate.base_salary if city_rate else state_salary,
                commission_per_delivery=(
                    city_rate.commission_per_delivery
                    if city_rate else state_commission
                ),
            ))
        response.append(DriverStatePayrollOut(
            state_id=state.id,
            state_name=state.name,
            base_salary=state_salary,
            commission_per_delivery=state_commission,
            cities=cities,
        ))
    return response


@router.put("/drivers/{driver_id}/defaults")
async def update_driver_default(
    driver_id: uuid.UUID,
    compensation: DriverCompensation,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _driver(db, driver_id)
    pricing = await db.scalar(
        select(DriverPricing).where(DriverPricing.driver_id == driver_id)
    )
    if pricing is None:
        pricing = DriverPricing(driver_id=driver_id)
        db.add(pricing)
    _apply_driver_compensation(pricing, compensation)

    state_rows = (await db.scalars(
        select(DriverStatePricing).where(DriverStatePricing.driver_id == driver_id)
    )).all()
    city_rows = (await db.scalars(
        select(DriverCityPricing).where(DriverCityPricing.driver_id == driver_id)
    )).all()
    for row in [*state_rows, *city_rows]:
        _apply_driver_compensation(row, compensation)
    await db.commit()
    return {"updated_driver": str(driver_id)}


@router.put("/drivers/{driver_id}/states/{state_id}")
async def update_driver_state(
    driver_id: uuid.UUID,
    state_id: uuid.UUID,
    compensation: DriverCompensation,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _driver(db, driver_id)
    state = await db.scalar(
        select(State)
        .join(Country)
        .where(State.id == state_id, Country.code == "CA")
        .options(selectinload(State.cities))
    )
    if state is None:
        raise HTTPException(status_code=404, detail="Canadian province not found.")

    pricing = await db.scalar(
        select(DriverStatePricing).where(
            DriverStatePricing.driver_id == driver_id,
            DriverStatePricing.state_id == state_id,
        )
    )
    if pricing is None:
        pricing = DriverStatePricing(driver_id=driver_id, state_id=state_id)
        db.add(pricing)
    _apply_driver_compensation(pricing, compensation)

    city_rows = (await db.scalars(
        select(DriverCityPricing).where(
            DriverCityPricing.driver_id == driver_id,
            DriverCityPricing.city_id.in_([city.id for city in state.cities]),
        )
    )).all()
    for row in city_rows:
        _apply_driver_compensation(row, compensation)
    await db.commit()
    return {"updated_state": str(state_id), "updated_cities": len(state.cities)}


@router.put("/drivers/{driver_id}/cities/{city_id}")
async def update_driver_city(
    driver_id: uuid.UUID,
    city_id: uuid.UUID,
    compensation: DriverCompensation,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _driver(db, driver_id)
    city = await db.scalar(
        select(City)
        .join(State)
        .join(Country)
        .where(City.id == city_id, Country.code == "CA")
    )
    if city is None:
        raise HTTPException(status_code=404, detail="Canadian city not found.")

    pricing = await db.scalar(
        select(DriverCityPricing).where(
            DriverCityPricing.driver_id == driver_id,
            DriverCityPricing.city_id == city_id,
        )
    )
    if pricing is None:
        pricing = DriverCityPricing(driver_id=driver_id, city_id=city_id)
        db.add(pricing)
    _apply_driver_compensation(pricing, compensation)
    await db.commit()
    return {"updated_city": str(city_id)}
