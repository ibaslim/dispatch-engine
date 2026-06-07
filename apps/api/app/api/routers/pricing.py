from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.core.deps import get_db, PlatformAdmin, CurrentUser
from app.models.location import City, CityPricing, State, Country

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class PricingUpsertRequest(BaseModel):
    city_ids: List[uuid.UUID]  # supports bulk / multi-city set
    partner_price_per_km: Optional[float] = None
    partner_price_per_kg: Optional[float] = None
    individual_price_per_km: Optional[float] = None
    individual_price_per_kg: Optional[float] = None


class CityPricingOut(BaseModel):
    id: uuid.UUID
    city_id: uuid.UUID
    city_name: str
    state_name: str
    country_name: str
    partner_price_per_km: Optional[float]
    partner_price_per_kg: Optional[float]
    individual_price_per_km: Optional[float]
    individual_price_per_kg: Optional[float]

    model_config = {"from_attributes": True}


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[CityPricingOut])
async def list_city_pricing(
    _: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return pricing for all cities that have pricing set."""
    result = await db.execute(
        select(CityPricing)
        .options(
            joinedload(CityPricing.city).joinedload(City.state).joinedload(State.country)
        )
    )
    rows = result.scalars().unique().all()

    out = []
    for cp in rows:
        out.append(
            CityPricingOut(
                id=cp.id,
                city_id=cp.city_id,
                city_name=cp.city.name,
                state_name=cp.city.state.name,
                country_name=cp.city.state.country.name,
                partner_price_per_km=cp.partner_price_per_km,
                partner_price_per_kg=cp.partner_price_per_kg,
                individual_price_per_km=cp.individual_price_per_km,
                individual_price_per_kg=cp.individual_price_per_kg,
            )
        )
    return out


@router.post("/upsert", status_code=status.HTTP_200_OK)
async def upsert_city_pricing(
    req: PricingUpsertRequest,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    """Create or update pricing for one or more cities at once."""
    if not req.city_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one city_id is required.",
        )

    upserted = []
    for city_id in req.city_ids:
        # Verify city exists
        city_res = await db.execute(select(City).where(City.id == city_id))
        city = city_res.scalar_one_or_none()
        if city is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"City {city_id} not found.",
            )

        # Check existing pricing
        pricing_res = await db.execute(
            select(CityPricing).where(CityPricing.city_id == city_id)
        )
        pricing = pricing_res.scalar_one_or_none()

        if pricing is None:
            pricing = CityPricing(city_id=city_id)
            db.add(pricing)

        pricing.partner_price_per_km = req.partner_price_per_km
        pricing.partner_price_per_kg = req.partner_price_per_kg
        pricing.individual_price_per_km = req.individual_price_per_km
        pricing.individual_price_per_kg = req.individual_price_per_kg

        upserted.append(str(city_id))

    await db.commit()
    return {"updated": upserted}


@router.delete("/{city_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_city_pricing(
    city_id: uuid.UUID,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    """Remove pricing for a city."""
    result = await db.execute(
        select(CityPricing).where(CityPricing.city_id == city_id)
    )
    pricing = result.scalar_one_or_none()
    if pricing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pricing not found.")
    await db.delete(pricing)
    await db.commit()
