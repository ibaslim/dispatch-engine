from uuid import UUID
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.store import Store
from app.models.user import User
from app.schemas.store import CreateStoreRequest, StoreResponse


async def list_stores_for_user(db: AsyncSession, user: User) -> List[Store]:
    """
    Return stores scoped to the user's tenant.
    Store dispatchers see only their assigned stores.
    Tenant admins and central dispatchers see all stores in tenant.
    Platform admins see all stores.
    """
    if user.is_platform_admin:
        result = await db.execute(select(Store).where(Store.is_active.is_(True)))
        return list(result.scalars().all())

    if user.tenant_id is None:
        return []

    # Check if user is scoped to specific stores
    accessible_ids = user.get_accessible_store_ids()
    if accessible_ids:
        result = await db.execute(
            select(Store).where(
                Store.tenant_id == user.tenant_id,
                Store.id.in_(accessible_ids),
                Store.is_active.is_(True),
            )
        )
    else:
        # Tenant admin / central dispatcher: all stores in tenant
        result = await db.execute(
            select(Store).where(
                Store.tenant_id == user.tenant_id,
                Store.is_active.is_(True),
            )
        )
    return list(result.scalars().all())


async def create_store(
    db: AsyncSession,
    user: User,
    req: CreateStoreRequest,
) -> Store:
    if user.tenant_id is None:
        raise ValueError("User has no tenant")
    store = Store(
        tenant_id=user.tenant_id,
        name=req.name,
        address=req.address,
    )
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return store
