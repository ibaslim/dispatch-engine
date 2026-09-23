"""Admin CRUD for discount types and discounts."""
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PlatformAdmin, get_db
from app.models.order import Order
from app.models.discount import (
    Coupon,
    Discount,
    DiscountStatus,
    DiscountTrigger,
    DiscountType,
)
from app.services.discounts import (
    amount_for,
    as_uuids,
    automatic_applied_ids,
    choose_best,
    coupons as coupon_rules,
    eligible_automatic,
    quantize,
)
from app.services.discounts import schedule as schedule_rules
from app.services.discounts.selection import DiscountSelectionError
from app.schemas.discount import (
    AutomaticOfferOut,
    CouponBatchCreate,
    CouponCheckOut,
    CouponCreate,
    CouponOut,
    CouponUpdate,
    DiscountInput,
    DiscountOut,
    DiscountTypeInput,
    DiscountTypeOut,
    DiscountUpdate,
)

router = APIRouter()

# Changing these after a discount has been given would rewrite what was agreed.
LOCKED_AFTER_USE = (
    "kind",
    "value",
    "value_mode",
    "max_discount_amount",
    "min_gross_fee",
    "min_net_fee",
)


def _out(discount: Discount) -> DiscountOut:
    payload = DiscountOut.model_validate(discount)
    payload.discount_type_title = discount.discount_type.title if discount.discount_type else None
    payload.schedule_label = schedule_rules.describe(discount.schedule)
    return payload


async def _get(db: AsyncSession, discount_id: uuid.UUID) -> Discount:
    discount = await db.scalar(
        select(Discount)
        .where(Discount.id == discount_id)
        .options(joinedload(Discount.discount_type))
    )
    if discount is None:
        raise HTTPException(status_code=404, detail="Discount not found.")
    return discount


async def _assert_type_exists(db: AsyncSession, type_id: uuid.UUID | None) -> None:
    if type_id is None:
        return
    if await db.get(DiscountType, type_id) is None:
        raise HTTPException(status_code=422, detail="That discount type no longer exists.")


# -------------------------
# DISCOUNT TYPES
# -------------------------
@router.get("/types", response_model=list[DiscountTypeOut])
async def list_types(_: PlatformAdmin, db: AsyncSession = Depends(get_db)):
    counts = dict(
        (
            await db.execute(
                select(Discount.discount_type_id, func.count(Discount.id)).group_by(
                    Discount.discount_type_id
                )
            )
        ).all()
    )
    types = (await db.scalars(select(DiscountType).order_by(DiscountType.title))).all()
    return [
        DiscountTypeOut(
            **DiscountTypeOut.model_validate(item).model_dump(exclude={"discount_count"}),
            discount_count=int(counts.get(item.id, 0)),
        )
        for item in types
    ]


@router.post("/types", response_model=DiscountTypeOut, status_code=status.HTTP_201_CREATED)
async def create_type(
    payload: DiscountTypeInput, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = DiscountType(title=payload.title.strip(), description=payload.description)
    db.add(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A discount type with that name exists.")
    await db.refresh(item)
    return DiscountTypeOut.model_validate(item)


@router.patch("/types/{type_id}", response_model=DiscountTypeOut)
async def update_type(
    type_id: uuid.UUID,
    payload: DiscountTypeInput,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(DiscountType, type_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Discount type not found.")
    item.title = payload.title.strip()
    item.description = payload.description
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A discount type with that name exists.")
    await db.refresh(item)
    return DiscountTypeOut.model_validate(item)


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_type(
    type_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    item = await db.get(DiscountType, type_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Discount type not found.")
    in_use = await db.scalar(
        select(func.count(Discount.id)).where(Discount.discount_type_id == type_id)
    )
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"{in_use} discount(s) still use this type. Move them first.",
        )
    await db.delete(item)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -------------------------
# DISCOUNTS
# -------------------------
@router.get("", response_model=list[DiscountOut])
async def list_discounts(
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
    trigger: DiscountTrigger | None = Query(default=None),
    status_filter: DiscountStatus | None = Query(default=None, alias="status"),
    discount_type_id: uuid.UUID | None = Query(default=None),
    at: datetime | None = Query(
        default=None,
        description="Planned pickup time; drops discounts whose schedule misses it.",
    ),
    time_specified: bool = Query(default=True),
):
    """Every discount, or just the ones the order form should offer."""
    query = select(Discount).options(joinedload(Discount.discount_type))
    if trigger is not None:
        query = query.where(Discount.trigger == trigger)
    if status_filter is not None:
        query = query.where(Discount.status == status_filter)
    if discount_type_id is not None:
        query = query.where(Discount.discount_type_id == discount_type_id)
    discounts = (await db.scalars(query.order_by(Discount.title))).all()
    if at is not None:
        # Recurrence lives in one place, so the client never re-implements it.
        moment = at.replace(tzinfo=None) if at.tzinfo else at
        discounts = [
            discount
            for discount in discounts
            if schedule_rules.matches(discount.schedule, moment, time_specified)
        ]
    return [_out(discount) for discount in discounts]


@router.post("", response_model=DiscountOut, status_code=status.HTTP_201_CREATED)
async def create_discount(
    payload: DiscountInput, current_user: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    await _assert_type_exists(db, payload.discount_type_id)
    discount = Discount(
        **payload.model_dump(
            exclude={"value", "schedule", "max_discount_amount", "min_gross_fee", "min_net_fee"}
        ),
        schedule=payload.schedule.model_dump(mode="json", exclude_none=True),
        value=Decimal(str(payload.value)) if payload.value is not None else None,
        max_discount_amount=(
            Decimal(str(payload.max_discount_amount))
            if payload.max_discount_amount is not None
            else None
        ),
        min_gross_fee=(
            Decimal(str(payload.min_gross_fee)) if payload.min_gross_fee is not None else None
        ),
        min_net_fee=Decimal(str(payload.min_net_fee)),
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(discount)
    await db.commit()
    return _out(await _get(db, discount.id))


@router.get("/automatic", response_model=list[AutomaticOfferOut])
async def automatic_offers(
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
    at: datetime = Query(description="Planned pickup time."),
    time_specified: bool = Query(default=True),
    delivery_fee: float = Query(default=0, ge=0),
    vendor_id: uuid.UUID | None = Query(default=None),
    order_id: uuid.UUID | None = Query(default=None),
    opted_out: list[uuid.UUID] = Query(default_factory=list),
):
    """The automatic discounts an order would get, and which one takes effect.

    The order form reads this instead of re-deciding it, so the rule that picks
    the winner lives in one place.
    """
    moment = at.replace(tzinfo=None) if at.tzinfo else at
    carried: set[uuid.UUID] = set()
    if order_id is not None:
        order = await db.get(Order, order_id)
        carried = automatic_applied_ids(order.applied_discounts if order else [])
    eligible = await eligible_automatic(
        db,
        pickup_at=moment,
        pickup_time_specified=time_specified,
        already_applied=carried,
    )
    fee = quantize(Decimal(str(delivery_fee)))
    skipped = set(as_uuids(opted_out))
    winner = choose_best(eligible, fee, skipped)

    offers: list[AutomaticOfferOut] = []
    for discount in eligible:
        if discount.id in skipped:
            state = "opted_out"
        elif winner is not None and discount.id == winner.id:
            state = "applied"
        elif fee <= 0:
            state = "waiting"
        else:
            state = "outranked"
        offers.append(
            AutomaticOfferOut(
                discount=_out(discount),
                amount=float(amount_for(discount, fee)),
                state=state,
            )
        )
    return offers


@router.get("/{discount_id}", response_model=DiscountOut)
async def get_discount(
    discount_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    return _out(await _get(db, discount_id))


@router.patch("/{discount_id}", response_model=DiscountOut)
async def update_discount(
    discount_id: uuid.UUID,
    payload: DiscountUpdate,
    current_user: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    discount = await _get(db, discount_id)
    changes = payload.model_dump(exclude_unset=True)

    if discount.redemption_count > 0:
        locked = [field for field in LOCKED_AFTER_USE if field in changes]
        if locked:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This discount has already been given, so its terms are fixed. "
                    "Copy it into a new discount instead."
                ),
            )
    if "discount_type_id" in changes:
        await _assert_type_exists(db, changes["discount_type_id"])

    money_fields = {"value", "max_discount_amount", "min_gross_fee", "min_net_fee"}
    for field, value in changes.items():
        if field in money_fields and value is not None:
            value = Decimal(str(value))
        if field == "schedule" and value is not None:
            value = payload.schedule.model_dump(mode="json", exclude_none=True)
        setattr(discount, field, value)

    if discount.trigger in ("automatic", "code") and discount.value_mode == "entered":
        raise HTTPException(
            status_code=422,
            detail="This discount needs a fixed amount; nobody is there to type one.",
        )
    if discount.value_mode == "fixed" and discount.value is None:
        raise HTTPException(
            status_code=422,
            detail="Set a value, or let the dispatcher enter one on the order.",
        )
    if discount.kind == "percentage" and Decimal(str(discount.value or 0)) > 100:
        raise HTTPException(status_code=422, detail="A percentage discount cannot be more than 100%.")
    discount.public_label = (discount.public_label or discount.title).strip()
    discount.updated_by = current_user.id
    await db.commit()
    return _out(await _get(db, discount_id))


@router.delete("/{discount_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discount(
    discount_id: uuid.UUID, _: PlatformAdmin, db: AsyncSession = Depends(get_db)
):
    """Only while it has never been given; otherwise it is archived instead."""
    discount = await _get(db, discount_id)
    if discount.redemption_count > 0:
        raise HTTPException(
            status_code=409,
            detail="This discount has been used. Set its status to archived instead.",
        )
    await db.delete(discount)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -------------------------
# COUPONS
# -------------------------
async def _coupon_or_404(db: AsyncSession, discount_id: uuid.UUID, coupon_id: uuid.UUID) -> Coupon:
    coupon = await db.scalar(
        select(Coupon).where(Coupon.id == coupon_id, Coupon.discount_id == discount_id)
    )
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found.")
    return coupon


async def _code_discount(db: AsyncSession, discount_id: uuid.UUID) -> Discount:
    """The discount, refusing anything a coupon couldn't legitimately unlock."""
    discount = await _get(db, discount_id)
    if discount.trigger != DiscountTrigger.code:
        raise HTTPException(
            status_code=422, detail="Codes can only be added to a coupon discount."
        )
    return discount


@router.post("/coupons/check", response_model=CouponCheckOut)
async def check_coupon(
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
    code: str = Query(...),
    at: datetime = Query(description="Planned pickup time."),
    time_specified: bool = Query(default=True),
    vendor_id: uuid.UUID | None = Query(default=None),
):
    """What a code resolves to, so the order form can show it before the order is saved."""
    moment = at.replace(tzinfo=None) if at.tzinfo else at
    try:
        discount, _coupon = await coupon_rules.validate(
            db,
            code,
            tenant_id=vendor_id,
            pickup_at=moment,
            pickup_time_specified=time_specified,
        )
    except DiscountSelectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    # coupon_rules.validate() doesn't eager-load discount_type; _out() needs it.
    return CouponCheckOut(discount=_out(await _get(db, discount.id)))


@router.get("/{discount_id}/coupons", response_model=list[CouponOut])
async def list_coupons(
    discount_id: uuid.UUID,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
    batch_label: str | None = Query(default=None),
):
    await _get(db, discount_id)
    query = select(Coupon).where(Coupon.discount_id == discount_id)
    if batch_label is not None:
        query = query.where(Coupon.batch_label == batch_label)
    rows = (await db.scalars(query.order_by(Coupon.created_at.desc()))).all()
    return [CouponOut.model_validate(row) for row in rows]


@router.post(
    "/{discount_id}/coupons", response_model=CouponOut, status_code=status.HTTP_201_CREATED
)
async def create_coupon(
    discount_id: uuid.UUID,
    payload: CouponCreate,
    current_user: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _code_discount(db, discount_id)
    coupon = await coupon_rules.create_single(
        db,
        discount_id=discount_id,
        code=payload.code,
        tenant_id=payload.tenant_id,
        max_uses=payload.max_uses,
        expires_at=payload.expires_at,
        created_by=current_user.id,
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="That code is already in use.")
    await db.refresh(coupon)
    return CouponOut.model_validate(coupon)


@router.post(
    "/{discount_id}/coupons/batch",
    response_model=list[CouponOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_coupon_batch(
    discount_id: uuid.UUID,
    payload: CouponBatchCreate,
    current_user: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    await _code_discount(db, discount_id)
    created = await coupon_rules.create_batch(
        db,
        discount_id=discount_id,
        count=payload.count,
        prefix=payload.prefix,
        batch_label=payload.batch_label,
        expires_at=payload.expires_at,
        created_by=current_user.id,
    )
    await db.commit()
    for coupon in created:
        await db.refresh(coupon)
    return [CouponOut.model_validate(coupon) for coupon in created]


@router.get("/{discount_id}/coupons/export.csv")
async def export_coupons(
    discount_id: uuid.UUID,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
    batch_label: str | None = Query(default=None),
):
    await _get(db, discount_id)
    query = select(Coupon).where(Coupon.discount_id == discount_id)
    if batch_label is not None:
        query = query.where(Coupon.batch_label == batch_label)
    rows = (await db.scalars(query.order_by(Coupon.created_at))).all()

    lines = ["code,max_uses,used_count,is_active,expires_at,batch_label"]
    for coupon in rows:
        lines.append(
            ",".join(
                [
                    coupon.code,
                    str(coupon.max_uses) if coupon.max_uses is not None else "",
                    str(coupon.used_count),
                    "yes" if coupon.is_active else "no",
                    coupon.expires_at.isoformat() if coupon.expires_at else "",
                    coupon.batch_label or "",
                ]
            )
        )
    filename = (batch_label or "coupons").replace(" ", "_")
    return Response(
        content="\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


@router.patch("/{discount_id}/coupons/{coupon_id}", response_model=CouponOut)
async def update_coupon(
    discount_id: uuid.UUID,
    coupon_id: uuid.UUID,
    payload: CouponUpdate,
    _: PlatformAdmin,
    db: AsyncSession = Depends(get_db),
):
    coupon = await _coupon_or_404(db, discount_id, coupon_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(coupon, field, value)
    await db.commit()
    await db.refresh(coupon)
    return CouponOut.model_validate(coupon)

