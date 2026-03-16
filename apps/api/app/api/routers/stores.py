from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, CurrentUser, TenantAdmin
from app.schemas.store import CreateStoreRequest, StoreResponse
from app.services.store_service import list_stores_for_user, create_store

router = APIRouter()


@router.get("", response_model=List[StoreResponse])
async def get_stores(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    stores = await list_stores_for_user(db, current_user)
    return [
        StoreResponse(
            id=s.id,
            name=s.name,
            tenant_id=s.tenant_id,
            is_active=s.is_active,
            created_at=s.created_at.isoformat(),
        )
        for s in stores
    ]


@router.post("", response_model=StoreResponse)
async def post_store(
    req: CreateStoreRequest,
    current_user: TenantAdmin,
    db: AsyncSession = Depends(get_db),
):
    store = await create_store(db, current_user, req)
    return StoreResponse(
        id=store.id,
        name=store.name,
        tenant_id=store.tenant_id,
        is_active=store.is_active,
        created_at=store.created_at.isoformat(),
    )
