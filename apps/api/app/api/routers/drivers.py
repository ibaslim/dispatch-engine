from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, CurrentUser

router = APIRouter()


@router.get("/me/jobs")
async def get_my_jobs(current_user: CurrentUser):
    """Stub: return assigned jobs for the authenticated driver."""
    return []


@router.post("/me/push-token", status_code=204)
async def register_push_token(
    body: dict,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Register FCM push token for the current driver."""
    from app.models.token import PushToken
    from sqlalchemy import select, update

    token = body.get("token")
    platform = body.get("platform", "android")

    if not token:
        return

    # Deactivate old tokens for this user
    await db.execute(
        update(PushToken)
        .where(PushToken.user_id == current_user.id)
        .values(is_active=False)
    )

    new_token = PushToken(
        user_id=current_user.id,
        token=token,
        platform=platform,
        is_active=True,
    )
    db.add(new_token)
    await db.commit()
