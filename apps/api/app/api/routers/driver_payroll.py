import uuid
from decimal import Decimal
from typing import Literal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

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
from app.models.driver_payment import (
    DriverPaymentGroup,
    DriverPaymentGroupAssignment,
)
from app.models.tenant import Tenant, TenantRole

router = APIRouter()

PaymentRuleType = Literal["fixed", "percentage", "passthrough"]


class PaymentGroupInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rule_type: PaymentRuleType
    fixed_amount: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    delivery_fee_percentage: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    platform_tip_percentage: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    driver_ids: list[uuid.UUID] = Field(default_factory=list)
    confirm_reassignments: bool = False

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("driver_ids")
    @classmethod
    def unique_driver_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def validate_rule_values(self):
        if self.rule_type == "fixed" and self.fixed_amount is None:
            raise ValueError("A fixed amount is required for fixed pay per delivery.")
        if self.rule_type in {"percentage", "passthrough"} and self.delivery_fee_percentage is None:
            raise ValueError("A delivery fee percentage is required for this payment rule.")
        if self.rule_type == "passthrough" and self.platform_tip_percentage is None:
            raise ValueError("A platform tip percentage is required for pass-through earnings.")
        return self


class PaymentGroupDriverOut(BaseModel):
    id: uuid.UUID
    name: str


class PaymentGroupOut(BaseModel):
    id: uuid.UUID
    name: str
    rule_type: PaymentRuleType
    fixed_amount: Decimal | None
    delivery_fee_percentage: Decimal | None
    platform_tip_percentage: Decimal | None
    drivers: list[PaymentGroupDriverOut]


def _payment_group_out(group: DriverPaymentGroup) -> PaymentGroupOut:
    return PaymentGroupOut(
        id=group.id,
        name=group.name,
        rule_type=group.rule_type,
        fixed_amount=group.fixed_amount,
        delivery_fee_percentage=group.delivery_fee_percentage,
        platform_tip_percentage=group.platform_tip_percentage,
        drivers=sorted(
            [PaymentGroupDriverOut(id=item.driver.id, name=item.driver.name) for item in group.assignments],
            key=lambda item: item.name.lower(),
        ),
    )


async def _loaded_group(db: AsyncSession, group_id: uuid.UUID) -> DriverPaymentGroup:
    group = await db.scalar(
        select(DriverPaymentGroup)
        .where(DriverPaymentGroup.id == group_id)
        .options(selectinload(DriverPaymentGroup.assignments).joinedload(DriverPaymentGroupAssignment.driver))
        .execution_options(populate_existing=True)
    )
    if group is None:
        raise HTTPException(status_code=404, detail="Payment group not found.")
    return group


async def _save_payment_group(
    db: AsyncSession,
    data: PaymentGroupInput,
    group: DriverPaymentGroup | None = None,
) -> DriverPaymentGroup:
    duplicate = await db.scalar(
        select(DriverPaymentGroup).where(
            func.lower(DriverPaymentGroup.name) == data.name.lower(),
            *([] if group is None else [DriverPaymentGroup.id != group.id]),
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="A payment group with this name already exists.")

    drivers = list((await db.scalars(
        select(Tenant).where(Tenant.id.in_(data.driver_ids), Tenant.role == TenantRole.driver)
    )).all()) if data.driver_ids else []
    if len(drivers) != len(data.driver_ids):
        raise HTTPException(status_code=400, detail="One or more selected drivers are invalid.")

    assignments = list((await db.scalars(
        select(DriverPaymentGroupAssignment)
        .where(DriverPaymentGroupAssignment.driver_id.in_(data.driver_ids))
        .options(joinedload(DriverPaymentGroupAssignment.driver), joinedload(DriverPaymentGroupAssignment.group))
    )).all()) if data.driver_ids else []
    conflicts = [item for item in assignments if group is None or item.group_id != group.id]
    if conflicts and not data.confirm_reassignments:
        raise HTTPException(status_code=409, detail={
            "message": "Some drivers already belong to another payment group.",
            "conflicts": [{
                "driver_id": str(item.driver_id),
                "driver_name": item.driver.name,
                "from_group_id": str(item.group_id),
                "from_group_name": item.group.name,
                "to_group_name": data.name,
            } for item in conflicts],
        })

    current_assignments = []
    if group is not None:
        current_assignments = list((await db.scalars(
            select(DriverPaymentGroupAssignment).where(
                DriverPaymentGroupAssignment.group_id == group.id
            )
        )).all())

    is_new_group = group is None
    if is_new_group:
        group = DriverPaymentGroup()
    group.name = data.name
    group.rule_type = data.rule_type
    group.fixed_amount = data.fixed_amount if data.rule_type == "fixed" else None
    group.delivery_fee_percentage = (
        data.delivery_fee_percentage if data.rule_type in {"percentage", "passthrough"} else None
    )
    group.platform_tip_percentage = (
        data.platform_tip_percentage if data.rule_type == "passthrough" else None
    )
    if is_new_group:
        db.add(group)
        await db.flush()

    current = {item.driver_id: item for item in current_assignments}
    selected = set(data.driver_ids)
    for driver_id, assignment in current.items():
        if driver_id not in selected:
            await db.delete(assignment)
    for driver in drivers:
        assignment = next((item for item in assignments if item.driver_id == driver.id), None)
        if assignment is None:
            db.add(DriverPaymentGroupAssignment(group_id=group.id, driver_id=driver.id))
        elif assignment.group_id != group.id:
            assignment.group_id = group.id
    await db.commit()
    return await _loaded_group(db, group.id)


@router.get("/groups", response_model=list[PaymentGroupOut])
async def list_payment_groups(_: CurrentUser, db: AsyncSession = Depends(get_db)):
    groups = (await db.scalars(
        select(DriverPaymentGroup)
        .options(selectinload(DriverPaymentGroup.assignments).joinedload(DriverPaymentGroupAssignment.driver))
        .order_by(DriverPaymentGroup.name)
    )).unique().all()
    return [_payment_group_out(group) for group in groups]


@router.post("/groups", response_model=PaymentGroupOut, status_code=201)
async def create_payment_group(data: PaymentGroupInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    return _payment_group_out(await _save_payment_group(db, data))


@router.put("/groups/{group_id}", response_model=PaymentGroupOut)
async def update_payment_group(group_id: uuid.UUID, data: PaymentGroupInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    group = await _loaded_group(db, group_id)
    return _payment_group_out(await _save_payment_group(db, data, group))


@router.delete("/groups/{group_id}", status_code=204)
async def delete_payment_group(group_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    group = await _loaded_group(db, group_id)
    await db.delete(group)
    await db.commit()


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
