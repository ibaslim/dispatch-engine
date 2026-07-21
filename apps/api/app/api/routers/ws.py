"""
WebSocket endpoint for real-time dispatcher updates.
Authentication via Authorization: Bearer <token> header.

Connection channels:
  - Each connected client is tracked by tenant_id (or "platform" for admins).
  - Clients with role="driver" are additionally tracked in `driver_connections`
    so we can broadcast published orders to all drivers at once.
"""
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_ws_user

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        # All connections keyed by tenant_id (or "platform")
        self.active_connections: dict[str, list[WebSocket]] = {}
        # Driver-only connections keyed by tenant.
        self.driver_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str, is_driver: bool = False):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)
        if is_driver:
            self.driver_connections.setdefault(tenant_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: str, is_driver: bool = False):
        self._remove_connection(websocket, tenant_id, is_driver=is_driver)

    def _remove_connection(
        self, websocket: WebSocket, tenant_id: str, is_driver: bool = False
    ) -> None:
        connections = self.active_connections.get(tenant_id, [])
        try:
            connections.remove(websocket)
        except ValueError:
            pass
        if not connections:
            self.active_connections.pop(tenant_id, None)

        if is_driver or tenant_id in self.driver_connections:
            driver_connections = self.driver_connections.get(tenant_id, [])
            try:
                driver_connections.remove(websocket)
            except ValueError:
                pass
            if not driver_connections:
                self.driver_connections.pop(tenant_id, None)

    def connected_driver_tenant_ids(self) -> list[str]:
        return list(self.driver_connections)

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        connections = self.active_connections.get(tenant_id, [])
        payload = json.dumps(message)

        async def send(connection: WebSocket) -> WebSocket | None:
            try:
                await connection.send_text(payload)
                return None
            except Exception:
                return connection

        dead = [connection for connection in await asyncio.gather(
            *(send(connection) for connection in list(connections))
        ) if connection is not None]
        for conn in dead:
            self._remove_connection(conn, tenant_id)

    async def broadcast_to_all_drivers(self, message: dict):
        """Broadcast a message to every connected driver WebSocket."""
        await asyncio.gather(*(
            self.broadcast_to_tenant(tenant_id, message)
            for tenant_id in self.connected_driver_tenant_ids()
        ))

    async def broadcast_to_all(self, message: dict):
        """Broadcast a message to every connected client (all tenants + platform)."""
        await asyncio.gather(*(
            self.broadcast_to_tenant(tenant_id, message)
            for tenant_id in list(self.active_connections)
        ))


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
        pass
    finally:
        manager.disconnect(websocket, tenant_id, is_driver=is_driver)
