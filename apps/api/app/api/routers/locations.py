from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List
import uuid

from app.core.deps import get_db, CurrentUser
from app.models.location import Country, State, City

router = APIRouter()


# ─── Response schemas ────────────────────────────────────────────────────────

class CountryOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str

    model_config = {"from_attributes": True}


class StateOut(BaseModel):
    id: uuid.UUID
    name: str
    country_id: uuid.UUID

    model_config = {"from_attributes": True}


class CityOut(BaseModel):
    id: uuid.UUID
    name: str
    state_id: uuid.UUID

    model_config = {"from_attributes": True}


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/countries", response_model=List[CountryOut])
async def list_countries(
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return all countries ordered by name."""
    result = await db.execute(select(Country).order_by(Country.name))
    return result.scalars().all()


@router.get("/countries/{country_id}/states", response_model=List[StateOut])
async def list_states(
    country_id: uuid.UUID,
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return all states for the given country."""
    result = await db.execute(
        select(State)
        .where(State.country_id == country_id)
        .order_by(State.name)
    )
    return result.scalars().all()


@router.get("/states/{state_id}/cities", response_model=List[CityOut])
async def list_cities(
    state_id: uuid.UUID,
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return all cities for the given state."""
    result = await db.execute(
        select(City)
        .where(City.state_id == state_id)
        .order_by(City.name)
    )
    return result.scalars().all()
