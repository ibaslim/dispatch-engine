from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.get("/{token}")
async def get_tracking(token: str):
    """
    Public endpoint: return tracking info for a delivery token.
    Token is high-entropy and associated with a specific order.
    Stub implementation — returns placeholder data.
    """
    # TODO: look up order by tracking token, return live status
    # For now return a stub so the tracking web app can render
    return {
        "order_id": "stub-order-id",
        "status": "in_transit",
        "driver_name": None,
        "estimated_arrival": None,
        "last_location": None,
    }
