"""Builders for real ORM objects.

Deliberately hand-written rather than factory_boy classes: factory_boy's
SQLAlchemy support is synchronous-session only, and every fixture here runs on
an AsyncSession. These stay explicit and awaitable.

Every factory returns a real app.models instance. Never add a stand-in dataclass
here -- see CLAUDE.md section 0.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.invitation import Invitation
from app.models.onboarding_application import ApplicationStatus, OnboardingApplication
from app.models.order import ActivityStatus, Order, OrderStatus
from app.models.store import Store
from app.models.tenant import Tenant, TenantRole
from app.models.user import RoleEnum, User, UserRole, UserStoreAccess

DEFAULT_PASSWORD = "correct-horse-battery-staple"


def _suffix() -> str:
    """Short unique token so unique columns never collide across a run."""
    return uuid.uuid4().hex[:10]


class TenantFactory:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        name: str = "Test Tenant",
        slug: Optional[str] = None,
        role: TenantRole = TenantRole.vendor,
        is_active: bool = True,
        **extra,
    ) -> Tenant:
        tenant = Tenant(
            name=name,
            slug=slug or f"tenant-{_suffix()}",
            role=role,
            is_active=is_active,
            contact_email=f"contact-{_suffix()}@example.test",
            **extra,
        )
        db.add(tenant)
        await db.flush()
        await db.refresh(tenant)
        return tenant


class UserFactory:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        tenant: Optional[Tenant] = None,
        roles: Iterable[RoleEnum | str] = (),
        email: Optional[str] = None,
        name: str = "Test User",
        password: Optional[str] = DEFAULT_PASSWORD,
        is_active: bool = True,
        is_platform_admin: bool = False,
        stores: Sequence[Store] = (),
        **extra,
    ) -> User:
        """Create a user with roles and optional per-store access.

        `stores` populates user_store_access, which store_dispatcher scoping reads
        through User.get_accessible_store_ids().
        """
        user = User(
            email=email or f"user-{_suffix()}@example.test",
            name=name,
            hashed_password=hash_password(password) if password else None,
            is_active=is_active,
            is_platform_admin=is_platform_admin,
            tenant_id=tenant.id if tenant else None,
            **extra,
        )
        db.add(user)
        await db.flush()

        for role in roles:
            db.add(UserRole(user_id=user.id, role=RoleEnum(role)))
        for store in stores:
            db.add(UserStoreAccess(user_id=user.id, store_id=store.id))

        await db.flush()
        await db.refresh(user, ["roles", "store_accesses"])
        return user


class StoreFactory:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        tenant: Tenant,
        name: str = "Test Store",
        address: str = "1 Test Street, Toronto, ON",
        is_active: bool = True,
        **extra,
    ) -> Store:
        store = Store(
            tenant_id=tenant.id,
            name=name,
            address=address,
            is_active=is_active,
            **extra,
        )
        db.add(store)
        await db.flush()
        await db.refresh(store)
        return store


class OrderFactory:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        vendor: Optional[Tenant] = None,
        driver: Optional[Tenant] = None,
        status: OrderStatus = OrderStatus.current,
        activity_status: Optional[ActivityStatus] = None,
        subtotal: float = 100.0,
        total: float = 110.0,
        **extra,
    ) -> Order:
        """Create an order.

        Orders carry no tenant_id: ownership is vendor_id/driver_id, both FKs to
        tenants.id. Pass Tenant objects, not User objects.
        """
        if activity_status is None:
            activity_status = (
                ActivityStatus.driver_not_assigned if driver is None else ActivityStatus.picked_up
            )
        defaults = {
            "order_number": f"ORD-{_suffix().upper()}",
            "vendor_id": vendor.id if vendor else None,
            "driver_id": driver.id if driver else None,
            "status": status,
            "activity_status": activity_status,
            "pickup_name": "Pickup Contact",
            "pickup_phone": "+15550000001",
            "pickup_email": "pickup@example.test",
            "pickup_address": "1 Test Street, Toronto, ON",
            "pickup_date": "2026-08-27",
            "pickup_time": "10:00",
            "delivery_name": "Delivery Contact",
            "delivery_phone": "+15550000002",
            "delivery_email": "delivery@example.test",
            "delivery_address": "2 Test Avenue, Toronto, ON",
            "delivery_date": "2026-08-27",
            "delivery_time": "12:00",
            "payment_method": "cash",
            "items": [],
            "surcharge_ids": [],
            "applied_charges": [],
            "subtotal": subtotal,
            "total": total,
        }
        order = Order(**{**defaults, **extra})
        db.add(order)
        await db.flush()
        await db.refresh(order)
        return order


class OnboardingApplicationFactory:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        user: User,
        role: str = RoleEnum.vendor.value,
        status: ApplicationStatus = ApplicationStatus.pending,
        data: Optional[dict] = None,
        **extra,
    ) -> OnboardingApplication:
        application = OnboardingApplication(
            user_id=user.id,
            role=role,
            status=status,
            data=data if data is not None else {"fullName": "Jane Doe", "email": "jane@example.test"},
            **extra,
        )
        db.add(application)
        await db.flush()
        await db.refresh(application)
        return application


class InvitationFactory:
    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        tenant: Optional[Tenant] = None,
        email: Optional[str] = None,
        role: str = RoleEnum.tenant_admin.value,
        hours_until_expiry: float = 72,
        is_used: bool = False,
        invited_by: Optional[User] = None,
        **extra,
    ) -> Invitation:
        invitation = make_invitation(
            email=email,
            role=role,
            tenant_id=tenant.id if tenant else None,
            hours_until_expiry=hours_until_expiry,
            is_used=is_used,
            **extra,
        )
        invitation.invited_by_id = invited_by.id if invited_by else None
        db.add(invitation)
        await db.flush()
        await db.refresh(invitation)
        return invitation


def make_invitation(
    email: Optional[str] = None,
    role: str = RoleEnum.tenant_admin.value,
    tenant_id: Optional[uuid.UUID] = None,
    hours_until_expiry: float = 72,
    is_used: bool = False,
    **extra,
) -> Invitation:
    """Build a real, unsaved Invitation.

    Invitation.is_valid() is pure, so expiry and single-use rules can be tested
    without a session. Use InvitationFactory.create when a row is needed.
    """
    return Invitation(
        email=email or f"invite-{_suffix()}@example.test",
        name="Invited User",
        token=f"token-{uuid.uuid4().hex}",
        role=role,
        tenant_id=tenant_id or uuid.uuid4(),
        tenant_name="Test Tenant",
        is_used=is_used,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=hours_until_expiry),
        **extra,
    )