import asyncio
from uuid import uuid4

from app.api.routers.pusher_channels import can_access_channel
from app.core.config import settings
from app.models.tenant import TenantRole
from app.services.pusher_service import PusherService, order_channels, tenant_channel


def test_platform_channel_is_admin_only() -> None:
    assert can_access_channel(
        channel_name="private-platform",
        is_platform_admin=True,
        tenant_id=None,
        tenant_role=None,
    )
    assert not can_access_channel(
        channel_name="private-platform",
        is_platform_admin=False,
        tenant_id=uuid4(),
        tenant_role=TenantRole.driver,
    )


def test_driver_channel_requires_driver_tenant() -> None:
    tenant_id = uuid4()
    assert can_access_channel(
        channel_name="private-drivers",
        is_platform_admin=False,
        tenant_id=tenant_id,
        tenant_role=TenantRole.driver,
    )
    assert not can_access_channel(
        channel_name="private-drivers",
        is_platform_admin=False,
        tenant_id=tenant_id,
        tenant_role=TenantRole.vendor,
    )


def test_tenant_can_only_access_its_own_channel() -> None:
    tenant_id = uuid4()
    assert can_access_channel(
        channel_name=tenant_channel(tenant_id),
        is_platform_admin=False,
        tenant_id=tenant_id,
        tenant_role=TenantRole.vendor,
    )
    assert not can_access_channel(
        channel_name=tenant_channel(uuid4()),
        is_platform_admin=False,
        tenant_id=tenant_id,
        tenant_role=TenantRole.vendor,
    )


def test_order_channels_are_private_and_deduplicated() -> None:
    vendor_id = uuid4()
    driver_id = uuid4()
    assert order_channels(
        vendor_id=vendor_id,
        driver_id=driver_id,
        extra_tenant_ids=[vendor_id],
        include_drivers=True,
    ) == sorted(
        [
            "private-platform",
            "private-drivers",
            tenant_channel(vendor_id),
            tenant_channel(driver_id),
        ]
    )


def test_order_event_publishes_a_small_scoped_envelope(monkeypatch) -> None:
    for name in ("pusher_app_id", "pusher_key", "pusher_secret", "pusher_cluster"):
        monkeypatch.setattr(settings, name, "configured")

    calls: list[tuple[object, str, dict, object]] = []

    class FakeClient:
        def trigger(self, channels, event_name, payload, socket_id=None):
            calls.append((channels, event_name, payload, socket_id))

    service = PusherService()
    service._client = FakeClient()  # type: ignore[assignment]
    vendor_id = uuid4()
    actor_id = uuid4()
    order_id = uuid4()

    result = asyncio.run(
        service.publish_order_event(
            "order-created",
            order_id,
            actor_user_id=actor_id,
            vendor_id=vendor_id,
            data={"order_number": "ORD-1"},
        )
    )

    assert result is True
    assert len(calls) == 1
    channels, event_name, payload, socket_id = calls[0]
    assert channels == sorted(["private-platform", tenant_channel(vendor_id)])
    assert event_name == "order-created"
    assert payload["order_id"] == str(order_id)
    assert payload["actor_user_id"] == str(actor_id)
    assert payload["order_number"] == "ORD-1"
    assert "event_id" in payload
    assert socket_id is None
