import asyncio
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import quote
from uuid import UUID

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import settings
from app.models.delivery_configuration import (
    AfterHoursDelivery,
    DeliveryPolicy,
    OperationalZone,
    OperationalZoneCity,
    PartnerZoneCategoryPrice,
    SpecialOccasion,
    Surcharge,
    ZoneCategoryPrice,
)
from app.models.location import City, Country, State


class DeliveryQuoteError(Exception):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class PlaceDetails:
    place_id: str
    formatted_address: str
    latitude: float
    longitude: float
    city: str
    province: str
    country_code: str


@dataclass(frozen=True)
class ResolvedLocation:
    place: PlaceDetails
    city: City
    zone: OperationalZone


@dataclass(frozen=True)
class DeliveryQuote:
    pickup: ResolvedLocation
    delivery: ResolvedLocation
    distance_meters: int
    duration_seconds: int
    radius_km: Decimal
    extra_distance_km: Decimal
    base_price: Decimal
    additional_per_km: Decimal
    distance_charge: Decimal
    applied_charges: tuple["AppliedCharge", ...]
    delivery_fee: Decimal
    manual_fallback: bool = False


@dataclass(frozen=True)
class AppliedCharge:
    id: UUID | None
    kind: str
    label: str
    amount: Decimal


def calculate_delivery_fee(
    distance_meters: int,
    radius_km: Decimal,
    base_price: Decimal,
    additional_per_km: Decimal,
) -> tuple[Decimal, Decimal]:
    distance_km = Decimal(distance_meters) / Decimal(1000)
    extra_km = max(Decimal("0"), distance_km - radius_km)
    fee = (base_price + extra_km * additional_per_km).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return extra_km.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), fee


def calculate_percentage_charge(amount: Decimal, percentage: Decimal) -> Decimal:
    return (amount * percentage / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _sum_charges(charges: list[AppliedCharge]) -> Decimal:
    return sum((charge.amount for charge in charges), Decimal("0.00"))


def _within_time_range(value: time, start: time, end: time) -> bool:
    if start < end:
        return start <= value < end
    return value >= start or value < end


def _occasion_matches(item: SpecialOccasion, requested_date: date) -> bool:
    return item.occasion_date == requested_date or (
        item.repeats_annually
        and item.occasion_date.month == requested_date.month
        and item.occasion_date.day == requested_date.day
    )


def _component(payload: dict, *types: str, short: bool = False) -> str:
    for component in payload.get("addressComponents", []):
        if any(value in component.get("types", []) for value in types):
            return str(component.get("shortText" if short else "longText", "")).strip()
    return ""


def _api_key() -> str:
    value = settings.google_maps_server_api_key or settings.google_maps_api_key
    if not value:
        raise DeliveryQuoteError(
            "Google Maps server API key is not configured.", status_code=503
        )
    return value


async def _fetch_place(client: httpx.AsyncClient, place_id: str) -> PlaceDetails:
    response = await client.get(
        f"https://places.googleapis.com/v1/places/{quote(place_id, safe='')}",
        headers={
            "X-Goog-Api-Key": _api_key(),
            "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents",
        },
    )
    if response.status_code == 429:
        raise DeliveryQuoteError(
            "Google Maps API quota is exhausted. Enter both addresses manually.",
            status_code=429,
        )
    if response.status_code != 200:
        raise DeliveryQuoteError("Unable to verify the selected address.", status_code=503)
    payload = response.json()
    location = payload.get("location") or {}
    city = _component(payload, "locality", "postal_town")
    province = _component(payload, "administrative_area_level_1")
    country_code = _component(payload, "country", short=True).upper()
    if not city or not province or not location:
        raise DeliveryQuoteError("Select a complete street address with a city and province.")
    return PlaceDetails(
        place_id=str(payload.get("id") or place_id),
        formatted_address=str(payload.get("formattedAddress") or ""),
        latitude=float(location["latitude"]),
        longitude=float(location["longitude"]),
        city=city,
        province=province,
        country_code=country_code,
    )


async def _fetch_route(
    client: httpx.AsyncClient, pickup_place_id: str, delivery_place_id: str
) -> tuple[int, int]:
    response = await client.post(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        headers={
            "X-Goog-Api-Key": _api_key(),
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
        },
        json={
            "origin": {"placeId": pickup_place_id},
            "destination": {"placeId": delivery_place_id},
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE",
        },
    )
    if response.status_code == 429:
        raise DeliveryQuoteError(
            "Google Maps API quota is exhausted. Enter both addresses manually.",
            status_code=429,
        )
    if response.status_code != 200:
        raise DeliveryQuoteError("Unable to calculate a driving route.", status_code=503)
    routes = response.json().get("routes") or []
    if not routes:
        raise DeliveryQuoteError("No driving route was found between these addresses.")
    route = routes[0]
    duration = str(route.get("duration") or "0s").removesuffix("s")
    return int(route.get("distanceMeters") or 0), int(float(duration or 0))


async def _resolve_location(db: AsyncSession, place: PlaceDetails) -> ResolvedLocation:
    if place.country_code != "CA":
        raise DeliveryQuoteError(f"{place.formatted_address} is outside the supported country.")
    result = await db.execute(
        select(City, OperationalZone)
        .join(State, City.state_id == State.id)
        .join(Country, State.country_id == Country.id)
        .join(OperationalZoneCity, OperationalZoneCity.city_id == City.id)
        .join(OperationalZone, OperationalZone.id == OperationalZoneCity.zone_id)
        .where(
            func.lower(City.name) == place.city.lower(),
            func.lower(State.name) == place.province.lower(),
            func.upper(Country.code) == place.country_code,
        )
    )
    row = result.first()
    if row is None:
        raise DeliveryQuoteError(
            f"{place.city}, {place.province} is outside the operational zones."
        )
    return ResolvedLocation(place=place, city=row[0], zone=row[1])


async def build_delivery_quote(
    db: AsyncSession,
    pickup_place_id: str,
    delivery_place_id: str,
    category_id: UUID,
    vendor_id: UUID | None = None,
    delivery_date: str | None = None,
    delivery_time: str | None = None,
    surcharge_ids: list[UUID] | None = None,
) -> DeliveryQuote:
    timeout = httpx.Timeout(12.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            pickup_place, delivery_place = await asyncio.gather(
                _fetch_place(client, pickup_place_id),
                _fetch_place(client, delivery_place_id),
            )
            pickup = await _resolve_location(db, pickup_place)
            delivery = await _resolve_location(db, delivery_place)

            policy = await db.scalar(
                select(DeliveryPolicy).where(DeliveryPolicy.key == "default")
            )
            allow_intercity = bool(policy and policy.allow_intercity)
            if not allow_intercity and pickup.city.id != delivery.city.id:
                raise DeliveryQuoteError(
                    "Inter-city delivery is disabled. Pickup and delivery must be in the same city."
                )

            price = await db.scalar(
                select(ZoneCategoryPrice)
                .where(
                    ZoneCategoryPrice.zone_id == pickup.zone.id,
                    ZoneCategoryPrice.category_id == category_id,
                )
                .options(
                    selectinload(ZoneCategoryPrice.partner_overrides).joinedload(
                        PartnerZoneCategoryPrice.partner
                    ),
                    joinedload(ZoneCategoryPrice.category),
                )
            )
            if price is None:
                raise DeliveryQuoteError(
                    "Pricing is not configured for this pickup zone and delivery category."
                )

            base_price = price.individual_price
            additional_per_km = price.individual_out_of_radius_per_km
            if vendor_id:
                override = next(
                    (item for item in price.partner_overrides if item.partner_id == vendor_id),
                    None,
                )
                base_price = override.price if override else price.partner_price
                additional_per_km = (
                    override.out_of_radius_per_km
                    if override
                    else price.partner_out_of_radius_per_km
                )

            distance_meters, duration_seconds = await _fetch_route(
                client, pickup.place.place_id, delivery.place.place_id
            )
    except httpx.HTTPError as exc:
        raise DeliveryQuoteError(
            "Google Maps is temporarily unavailable.", status_code=503
        ) from exc

    extra_distance_km, distance_fee = calculate_delivery_fee(
        distance_meters,
        Decimal(pickup.zone.radius_km),
        Decimal(base_price),
        Decimal(additional_per_km),
    )
    applied_charges: list[AppliedCharge] = []
    if delivery_time:
        try:
            requested_time = time.fromisoformat(delivery_time)
        except ValueError as exc:
            raise DeliveryQuoteError("Enter a valid delivery time.") from exc
        after_hours = (
            await db.scalars(select(AfterHoursDelivery).order_by(AfterHoursDelivery.start_time))
        ).all()
        applied_charges.extend(
            AppliedCharge(
                id=item.id,
                kind="after_hours",
                label="After-hours delivery",
                amount=Decimal(item.extra_amount),
            )
            for item in after_hours
            if _within_time_range(requested_time, item.start_time, item.end_time)
        )

    try:
        requested_surcharge_ids = list(
            dict.fromkeys(UUID(str(value)) for value in (surcharge_ids or []))
        )
    except ValueError as exc:
        raise DeliveryQuoteError("One or more selected surcharges are invalid.") from exc
    if requested_surcharge_ids:
        surcharges = (
            await db.scalars(
                select(Surcharge)
                .where(Surcharge.id.in_(requested_surcharge_ids))
                .order_by(Surcharge.name)
            )
        ).all()
        if len(surcharges) != len(requested_surcharge_ids):
            raise DeliveryQuoteError("One or more selected surcharges no longer exist.")
        applied_charges.extend(
            AppliedCharge(
                id=item.id,
                kind="surcharge",
                label=item.name,
                amount=Decimal(item.extra_amount),
            )
            for item in surcharges
        )

    chargeable_delivery_fee = distance_fee + _sum_charges(applied_charges)
    if delivery_date:
        try:
            requested_date = date.fromisoformat(delivery_date)
        except ValueError as exc:
            raise DeliveryQuoteError("Enter a valid delivery date.") from exc
        occasions = (
            await db.scalars(
                select(SpecialOccasion).order_by(
                    SpecialOccasion.occasion_date, SpecialOccasion.name
                )
            )
        ).all()
        applied_charges.extend(
            AppliedCharge(
                id=item.id,
                kind="special_occasion",
                label=f"{item.name} ({Decimal(item.extra_percentage):g}%)",
                amount=calculate_percentage_charge(
                    chargeable_delivery_fee, Decimal(item.extra_percentage)
                ),
            )
            for item in occasions
            if _occasion_matches(item, requested_date)
            and Decimal(item.extra_percentage) > 0
        )

    delivery_fee = (distance_fee + _sum_charges(applied_charges)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return DeliveryQuote(
        pickup=pickup,
        delivery=delivery,
        distance_meters=distance_meters,
        duration_seconds=duration_seconds,
        radius_km=Decimal(pickup.zone.radius_km),
        extra_distance_km=extra_distance_km,
        base_price=Decimal(base_price),
        additional_per_km=Decimal(additional_per_km),
        distance_charge=(distance_fee - Decimal(base_price)).quantize(Decimal("0.01")),
        applied_charges=tuple(applied_charges),
        delivery_fee=delivery_fee,
    )


def _normalized_address(value: str) -> str:
    return " ".join(value.casefold().split())


def match_manual_operational_region(
    address: str,
    zones: list[OperationalZone],
) -> tuple[OperationalZone, City] | None:
    normalized = _normalized_address(address)
    if not normalized:
        return None
    matches: list[tuple[int, OperationalZone, City]] = []
    for zone in zones:
        zone_cities = [item.city for item in zone.cities]
        if zone_cities and _normalized_address(zone.name) in normalized:
            matches.append((len(zone.name), zone, zone_cities[0]))
        matches.extend(
            (len(city.name), zone, city)
            for city in zone_cities
            if _normalized_address(city.name) in normalized
        )
    if not matches:
        return None
    _, zone, city = max(matches, key=lambda item: item[0])
    return zone, city


async def _resolve_manual_location(
    db: AsyncSession,
    address: str,
) -> ResolvedLocation:
    if not _normalized_address(address):
        raise DeliveryQuoteError("Enter a manual street address.")
    zones = list((await db.scalars(
        select(OperationalZone)
        .options(
            selectinload(OperationalZone.cities)
            .joinedload(OperationalZoneCity.city)
            .joinedload(City.state)
        )
        .order_by(OperationalZone.name)
    )).unique().all())
    match = match_manual_operational_region(address, zones)
    if not match:
        raise DeliveryQuoteError(
            "Manual address is outside the operational regions. Include a configured zone or city name."
        )
    zone, city = match
    return ResolvedLocation(
        place=PlaceDetails(
            place_id=f"manual:{zone.id}",
            formatted_address=address.strip(),
            latitude=0,
            longitude=0,
            city=city.name,
            province=city.state.name,
            country_code="CA",
        ),
        city=city,
        zone=zone,
    )


async def build_manual_delivery_quote(
    db: AsyncSession,
    pickup_address: str,
    delivery_address: str,
    category_id: UUID,
    vendor_id: UUID | None = None,
    delivery_date: str | None = None,
    delivery_time: str | None = None,
    surcharge_ids: list[UUID] | None = None,
) -> DeliveryQuote:
    pickup = await _resolve_manual_location(db, pickup_address)
    delivery = await _resolve_manual_location(db, delivery_address)
    policy = await db.scalar(select(DeliveryPolicy).where(DeliveryPolicy.key == "default"))
    if not bool(policy and policy.allow_intercity) and pickup.city.id != delivery.city.id:
        raise DeliveryQuoteError(
            "Inter-city delivery is disabled. Pickup and delivery must include the same configured city."
        )

    price = await db.scalar(
        select(ZoneCategoryPrice)
        .where(
            ZoneCategoryPrice.zone_id == pickup.zone.id,
            ZoneCategoryPrice.category_id == category_id,
        )
        .options(
            selectinload(ZoneCategoryPrice.partner_overrides).joinedload(
                PartnerZoneCategoryPrice.partner
            )
        )
    )
    if price is None:
        raise DeliveryQuoteError(
            "Pricing is not configured for this pickup zone and delivery category."
        )
    base_price = price.individual_price
    if vendor_id:
        override = next(
            (item for item in price.partner_overrides if item.partner_id == vendor_id),
            None,
        )
        base_price = override.price if override else price.partner_price

    # Manual fallback intentionally uses fixed base pricing. Configured
    # after-hours, selected surcharge and special-occasion charges still apply.
    applied_charges: list[AppliedCharge] = []
    if delivery_time:
        try:
            requested_time = time.fromisoformat(delivery_time)
        except ValueError as exc:
            raise DeliveryQuoteError("Enter a valid delivery time.") from exc
        after_hours = (
            await db.scalars(select(AfterHoursDelivery).order_by(AfterHoursDelivery.start_time))
        ).all()
        applied_charges.extend(
            AppliedCharge(
                id=item.id,
                kind="after_hours",
                label="After-hours delivery",
                amount=Decimal(item.extra_amount),
            )
            for item in after_hours
            if _within_time_range(requested_time, item.start_time, item.end_time)
        )

    try:
        requested_surcharge_ids = list(
            dict.fromkeys(UUID(str(value)) for value in (surcharge_ids or []))
        )
    except ValueError as exc:
        raise DeliveryQuoteError("One or more selected surcharges are invalid.") from exc
    if requested_surcharge_ids:
        surcharges = list((await db.scalars(
            select(Surcharge)
            .where(Surcharge.id.in_(requested_surcharge_ids))
            .order_by(Surcharge.name)
        )).all())
        if len(surcharges) != len(requested_surcharge_ids):
            raise DeliveryQuoteError("One or more selected surcharges no longer exist.")
        applied_charges.extend(
            AppliedCharge(
                id=item.id,
                kind="surcharge",
                label=item.name,
                amount=Decimal(item.extra_amount),
            )
            for item in surcharges
        )

    chargeable_delivery_fee = Decimal(base_price) + _sum_charges(applied_charges)
    if delivery_date:
        try:
            requested_date = date.fromisoformat(delivery_date)
        except ValueError as exc:
            raise DeliveryQuoteError("Enter a valid delivery date.") from exc
        occasions = list((await db.scalars(
            select(SpecialOccasion).order_by(
                SpecialOccasion.occasion_date, SpecialOccasion.name
            )
        )).all())
        applied_charges.extend(
            AppliedCharge(
                id=item.id,
                kind="special_occasion",
                label=f"{item.name} ({Decimal(item.extra_percentage):g}%)",
                amount=calculate_percentage_charge(
                    chargeable_delivery_fee, Decimal(item.extra_percentage)
                ),
            )
            for item in occasions
            if _occasion_matches(item, requested_date)
            and Decimal(item.extra_percentage) > 0
        )

    delivery_fee = (Decimal(base_price) + _sum_charges(applied_charges)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return DeliveryQuote(
        pickup=pickup,
        delivery=delivery,
        distance_meters=0,
        duration_seconds=0,
        radius_km=Decimal(pickup.zone.radius_km),
        extra_distance_km=Decimal("0.00"),
        base_price=Decimal(base_price),
        additional_per_km=Decimal("0.00"),
        distance_charge=Decimal("0.00"),
        applied_charges=tuple(applied_charges),
        delivery_fee=delivery_fee,
        manual_fallback=True,
    )
