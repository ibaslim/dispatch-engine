"""Test infrastructure: engine, per-test transaction, ASGI client, auth actors.

See CLAUDE.md in this directory for the rules these fixtures exist to enforce.
"""
import os

# Must precede any `app.` import: app.core.config.settings is a module-level
# singleton built at import time, and os.environ outranks the .env file.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://dispatch:dispatch@localhost:5432/dispatch_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production")
# Keep whatever host the environment provides, but force a throwaway db index.
os.environ["REDIS_URL"] = (
    os.environ.get("REDIS_URL", "redis://localhost:6379/0").rsplit("/", 1)[0] + "/15"
)
# Blank credentials keep PusherService.enabled False, so publish() is a no-op.
for _key in ("PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"):
    os.environ[_key] = ""

from typing import AsyncIterator, Callable  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

import app.models  # noqa: F401,E402  -- registers every mapper on Base.metadata
from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models.tenant import Tenant, TenantRole  # noqa: E402
from app.models.user import RoleEnum, User  # noqa: E402
from tests.factories import OrderFactory, StoreFactory, TenantFactory, UserFactory  # noqa: E402

_DB_NAME = make_url(settings.database_url).database or ""
if "test" not in _DB_NAME:
    raise RuntimeError(
        f"Refusing to run: DATABASE_URL points at {_DB_NAME!r}, which is not a test "
        "database. The suite drops and recreates the whole schema. Set DATABASE_URL "
        "to a database whose name contains 'test'."
    )


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    """Session-wide engine; schema is built once from the real model metadata.

    Note: driver_location_logs is a plain table here. Its Timescale hypertable
    conversion lives only in alembic/versions/0031_driver_location_logs.py, so
    tests asserting hypertable behavior must run migrations instead.
    """
    eng = create_async_engine(settings.database_url, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def redis_pool():
    """Real Redis on db 15, so get_redis() resolves and dev keys stay untouched.

    Function-scoped on purpose: a redis-py pool binds to the event loop it first
    talks on, and a session-scoped one raises "attached to a different loop" in
    per-test loops. from_url is lazy, so tests that never touch Redis pay nothing.
    Keys are namespaced by per-test UUIDs, so no flush is needed between tests.
    """
    from app.core.redis import close_redis, init_redis

    await init_redis()
    yield
    await close_redis()


@pytest_asyncio.fixture
async def db(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """A session inside a transaction that is always rolled back.

    join_transaction_mode="create_savepoint" is load-bearing: services under test
    call db.commit(), and without it those commits would escape this transaction
    and leak rows into the next test.
    """
    conn = await engine.connect()
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()


# --------------------------------------------------------------------------- #
# Application client
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Unauthenticated client bound to the test transaction.

    ASGITransport deliberately does not run lifespan: app.main's lifespan calls
    init_redis, init_db and three seed_* functions. Never wrap this in
    LifespanManager.
    """
    application = create_app()
    # Override the exact callable routers resolve; app.core.deps aliases this object.
    application.dependency_overrides[get_db] = lambda: db
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    application.dependency_overrides.clear()


@pytest.fixture
def authenticate(client: AsyncClient) -> Callable[[User], AsyncClient]:
    """Attach a real JWT for `user` to the shared client."""

    def _authenticate(user: User) -> AsyncClient:
        client.headers["Authorization"] = f"Bearer {create_access_token(str(user.id))}"
        return client

    return _authenticate


# --------------------------------------------------------------------------- #
# Domain fixtures
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def tenant(db: AsyncSession) -> Tenant:
    """The tenant under test. Vendor role: owns stores and places orders."""
    return await TenantFactory.create(db, name="Acme Vendor", role=TenantRole.vendor)


@pytest_asyncio.fixture
async def other_tenant(db: AsyncSession) -> Tenant:
    """A second tenant, used to prove isolation boundaries hold."""
    return await TenantFactory.create(db, name="Rival Vendor", role=TenantRole.vendor)


@pytest_asyncio.fixture
async def driver_tenant(db: AsyncSession) -> Tenant:
    """Orders reference drivers by tenant id, not user id."""
    return await TenantFactory.create(db, name="Fast Driver", role=TenantRole.driver)


@pytest_asyncio.fixture
async def store(db: AsyncSession, tenant: Tenant):
    return await StoreFactory.create(db, tenant=tenant)


@pytest_asyncio.fixture
async def order(db: AsyncSession, tenant: Tenant):
    """An unassigned order belonging to `tenant` as vendor."""
    return await OrderFactory.create(db, vendor=tenant)


# --------------------------------------------------------------------------- #
# Authenticated actors
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def platform_admin(db: AsyncSession) -> User:
    return await UserFactory.create(
        db, tenant=None, is_platform_admin=True, roles=(RoleEnum.platform_admin,)
    )


@pytest_asyncio.fixture
async def tenant_admin(db: AsyncSession, tenant: Tenant) -> User:
    return await UserFactory.create(db, tenant=tenant, roles=(RoleEnum.tenant_admin,))


@pytest_asyncio.fixture
async def dispatcher(db: AsyncSession, tenant: Tenant) -> User:
    return await UserFactory.create(db, tenant=tenant, roles=(RoleEnum.central_dispatcher,))


@pytest_asyncio.fixture
async def driver(db: AsyncSession, driver_tenant: Tenant) -> User:
    return await UserFactory.create(db, tenant=driver_tenant, roles=(RoleEnum.driver,))


@pytest_asyncio.fixture
async def outsider(db: AsyncSession, other_tenant: Tenant) -> User:
    """Tenant admin of a different tenant. The actor for isolation tests."""
    return await UserFactory.create(db, tenant=other_tenant, roles=(RoleEnum.tenant_admin,))


@pytest_asyncio.fixture
async def platform_admin_client(authenticate, platform_admin: User) -> AsyncClient:
    return authenticate(platform_admin)


@pytest_asyncio.fixture
async def tenant_admin_client(authenticate, tenant_admin: User) -> AsyncClient:
    return authenticate(tenant_admin)


@pytest_asyncio.fixture
async def dispatcher_client(authenticate, dispatcher: User) -> AsyncClient:
    return authenticate(dispatcher)


@pytest_asyncio.fixture
async def driver_client(authenticate, driver: User) -> AsyncClient:
    return authenticate(driver)


@pytest_asyncio.fixture
async def other_tenant_client(authenticate, outsider: User) -> AsyncClient:
    """Authenticated as a different tenant. Cross-tenant reads must return 404."""
    return authenticate(outsider)


# --------------------------------------------------------------------------- #
# External boundaries
# --------------------------------------------------------------------------- #


@pytest.fixture(autouse=True)
def block_outbound_email(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    """Capture SMTP sends instead of delivering them. Returns the sent list."""
    sent: list[tuple] = []
    monkeypatch.setattr(
        "app.services.email_service.send_email_sync",
        lambda *args, **kwargs: sent.append((args, kwargs)),
    )
    return sent


@pytest.fixture
def published_events(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """Record Pusher publishes. Request this fixture to assert on realtime events.

    Not autouse: blank Pusher credentials already make publish() a no-op, so
    tests that do not care about events need no patching.
    """
    events: list[dict] = []

    async def _capture(channels, event_name, payload, socket_id=None) -> bool:
        events.append(
            {"channels": channels, "event": event_name, "payload": payload}
        )
        return True

    # Patch the method on the shared singleton so module-level imports see it.
    monkeypatch.setattr("app.services.pusher_service.pusher_service.publish", _capture)
    return events

@pytest.fixture(autouse=True)
def queued_tasks(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict]]:
    """Capture Celery .delay() calls instead of enqueueing them on Redis.

    Returns (task_name, kwargs) pairs. Request the fixture to assert that an
    endpoint queued the email it promises.
    """
    import app.workers.tasks as tasks_module

    calls: list[tuple[str, dict]] = []

    def _recorder(task_name: str):
        def _delay(*args, **kwargs):
            calls.append((task_name, kwargs))

        return _delay

    for attr in dir(tasks_module):
        if attr.startswith("_"):
            continue
        candidate = getattr(tasks_module, attr)
        if callable(getattr(candidate, "delay", None)):
            monkeypatch.setattr(candidate, "delay", _recorder(attr))
    return calls
