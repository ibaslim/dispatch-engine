"""
WebSocket endpoint for real-time dispatcher updates.
Authentication via Authorization: Bearer <token> header.
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_ws_user

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: str):
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].remove(websocket)

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        connections = self.active_connections.get(tenant_id, [])
        for connection in connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    user = await get_ws_user(websocket, db)
    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    tenant_id = str(user.tenant_id) if user.tenant_id else "platform"
    await manager.connect(websocket, tenant_id)

    try:
        while True:
            data = await websocket.receive_text()
            # Echo back as acknowledgement (extend for real use)
            await websocket.send_text(json.dumps({"type": "ack", "data": data}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, tenant_id)
