import asyncio
import json

from app.api.routers.ws import ConnectionManager


class SendBarrier:
    def __init__(self, expected: int) -> None:
        self.expected = expected
        self.started = 0
        self.ready = asyncio.Event()

    async def wait(self) -> None:
        self.started += 1
        if self.started == self.expected:
            self.ready.set()
        await asyncio.wait_for(self.ready.wait(), timeout=0.2)


class FakeWebSocket:
    def __init__(self, *, fail: bool = False, barrier: SendBarrier | None = None) -> None:
        self.fail = fail
        self.barrier = barrier
        self.accepted = False
        self.messages: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, payload: str) -> None:
        if self.barrier:
            await self.barrier.wait()
        if self.fail:
            raise RuntimeError("socket closed")
        self.messages.append(json.loads(payload))


async def test_failed_global_broadcast_removes_all_connection_indexes() -> None:
    manager = ConnectionManager()
    socket = FakeWebSocket(fail=True)
    await manager.connect(socket, "driver-1", is_driver=True)

    await manager.broadcast_to_all({"type": "order_accepted"})

    assert manager.active_connections == {}
    assert manager.driver_connections == {}
    assert manager.connected_driver_tenant_ids() == []


async def test_driver_broadcast_only_targets_connected_driver_tenants() -> None:
    manager = ConnectionManager()
    driver_socket = FakeWebSocket()
    platform_socket = FakeWebSocket()
    await manager.connect(driver_socket, "driver-1", is_driver=True)
    await manager.connect(platform_socket, "platform")

    await manager.broadcast_to_all_drivers({"type": "new_order"})

    assert driver_socket.messages == [{"type": "new_order"}]
    assert platform_socket.messages == []


async def test_tenant_broadcast_sends_to_connections_concurrently() -> None:
    manager = ConnectionManager()
    barrier = SendBarrier(expected=2)
    first = FakeWebSocket(barrier=barrier)
    second = FakeWebSocket(barrier=barrier)
    await manager.connect(first, "driver-1", is_driver=True)
    await manager.connect(second, "driver-1", is_driver=True)

    await manager.broadcast_to_tenant("driver-1", {"type": "new_order"})

    assert first.messages == [{"type": "new_order"}]
    assert second.messages == [{"type": "new_order"}]
