"""
WebSocket endpoint for real-time dispatcher updates.
Authentication via Authorization: Bearer <token> header.

Connection channels:
  - Each connected client is tracked by tenant_id (or "platform" for admins).
  - Clients with role="driver" are additionally tracked in `driver_connections`
    so we can broadcast published orders to all drivers at once.
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_ws_user

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        # All connections keyed by tenant_id (or "platform")
        self.active_connections: dict[str, list[WebSocket]] = {}
        # Driver-only connections for broadcast
        self.driver_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, tenant_id: str, is_driver: bool = False):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)
        if is_driver:
            self.driver_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: str, is_driver: bool = False):
        if tenant_id in self.active_connections:
            try:
                self.active_connections[tenant_id].remove(websocket)
            except ValueError:
                pass
        if is_driver:
            try:
                self.driver_connections.remove(websocket)
            except ValueError:
                pass

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        connections = self.active_connections.get(tenant_id, [])
        dead = []
        for connection in connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                dead.append(connection)
        for conn in dead:
            try:
                connections.remove(conn)
            except ValueError:
                pass

    async def broadcast_to_all_drivers(self, message: dict):
        """Broadcast a message to every connected driver WebSocket."""
        payload = json.dumps(message)
        dead = []
        for connection in self.driver_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                dead.append(connection)
        for conn in dead:
            try:
                self.driver_connections.remove(conn)
            except ValueError:
                pass

    async def broadcast_to_all(self, message: dict):
        """Broadcast a message to every connected client (all tenants + platform)."""
        payload = json.dumps(message)
        for connections in self.active_connections.values():
            dead = []
            for connection in connections:
                try:
                    await connection.send_text(payload)
                except Exception:
                    dead.append(connection)
            for conn in dead:
                try:
                    connections.remove(conn)
                except ValueError:
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

    # Determine if this connection belongs to a driver tenant
    is_driver = False
    if user.tenant_id:
        from sqlalchemy import select
        from app.models.tenant import Tenant, TenantRole
        result = await db.execute(
            select(Tenant).where(Tenant.id == user.tenant_id)
        )
        tenant = result.scalar_one_or_none()
        if tenant and tenant.role == TenantRole.driver:
            is_driver = True

    await manager.connect(websocket, tenant_id, is_driver=is_driver)

    try:
        while True:
            data = await websocket.receive_text()
            # Echo back as acknowledgement
            await websocket.send_text(json.dumps({"type": "ack", "data": data}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, tenant_id, is_driver=is_driver)
