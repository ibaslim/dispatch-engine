from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Union
from urllib.parse import unquote
from app.core.deps import get_db
from app.schemas.auth import TokenResponse, PendingApprovalResponse
from app.schemas.invitation import AcceptInvitationRequest
from app.services.invitation_service import accept_invitation

router = APIRouter()


@router.post("/accept", response_model=Union[TokenResponse, PendingApprovalResponse])
async def accept_invite(
    req: AcceptInvitationRequest,
    db: AsyncSession = Depends(get_db),
):
    if len(req.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )
    if not req.username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username is required",
        )
    # URL-decode and trim the token to defend against encoding/whitespace issues
    token = unquote((req.token or "").strip())
    result = await accept_invitation(
        db=db,
        token=token,
        password=req.password,
        name=req.name,
        username=req.username,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token",
        )
    return result
