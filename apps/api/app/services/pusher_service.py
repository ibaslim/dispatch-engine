"""Pusher Channels publishing and private-channel authorization helpers."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Iterable
from uuid import UUID, uuid4

import pusher

from app.core.config import settings


logger = logging.getLogger(__name__)

PLATFORM_CHANNEL = "private-platform"
DRIVERS_CHANNEL = "private-drivers"


def tenant_channel(tenant_id: UUID | str) -> str:
    return f"private-tenant-{tenant_id}"


def order_channels(
    *,
    vendor_id: UUID | str | None = None,
    driver_id: UUID | str | None = None,
    extra_tenant_ids: Iterable[UUID | str | None] = (),
    include_drivers: bool = False,
) -> list[str]:
    """Return the de-duplicated private channels allowed to see an order event."""
    channels = {PLATFORM_CHANNEL}
    tenant_ids = {vendor_id, driver_id, *extra_tenant_ids}
    channels.update(tenant_channel(value) for value in tenant_ids if value is not None)
    if include_drivers:
        channels.add(DRIVERS_CHANNEL)
    return sorted(channels)


class PusherService:
    def __init__(self) -> None:
        self._client: pusher.Pusher | None = None

    @property
    def enabled(self) -> bool:
        return settings.pusher_enabled

    def _get_client(self) -> pusher.Pusher:
        if not self.enabled:
            raise RuntimeError("Pusher Channels is not configured")
        if self._client is None:
            self._client = pusher.Pusher(
                app_id=settings.pusher_app_id,
                key=settings.pusher_key,
                secret=settings.pusher_secret,
                cluster=settings.pusher_cluster,
                ssl=True,
            )
        return self._client

    def authorize_channel(self, channel_name: str, socket_id: str) -> dict[str, str]:
        """Generate the signed response required for a private subscription."""
        return self._get_client().authenticate(
            channel=channel_name,
            socket_id=socket_id,
        )

    async def publish(
        self,
        channels: str | list[str],
        event_name: str,
        payload: dict[str, Any],
        socket_id: str | None = None,
    ) -> bool:
        """Publish without blocking FastAPI's event loop.

        A real-time transport outage must not roll back an already committed
        order mutation. Failures are logged and clients recover from REST.
        """
        if not self.enabled:
            logger.debug("Pusher disabled; skipped %s", event_name)
            return False

        try:
            await asyncio.to_thread(
                self._get_client().trigger,
                channels,
                event_name,
                payload,
                socket_id,
            )
            return True
        except Exception:
            logger.exception("Unable to publish Pusher event %s", event_name)
            return False

    async def publish_order_event(
        self,
        event_name: str,
        order_id: UUID | str,
        *,
        actor_user_id: UUID | str,
        vendor_id: UUID | str | None = None,
        driver_id: UUID | str | None = None,
        extra_tenant_ids: Iterable[UUID | str | None] = (),
        include_drivers: bool = False,
        data: dict[str, Any] | None = None,
        socket_id: str | None = None,
    ) -> bool:
        payload: dict[str, Any] = {
            "event_id": str(uuid4()),
            "event": event_name,
            "order_id": str(order_id),
            "actor_user_id": str(actor_user_id),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        if data:
            payload.update(data)
        return await self.publish(
            order_channels(
                vendor_id=vendor_id,
                driver_id=driver_id,
                extra_tenant_ids=extra_tenant_ids,
                include_drivers=include_drivers,
            ),
            event_name,
            payload,
            socket_id,
        )


pusher_service = PusherService()
