"""Auth surface: /auth/* endpoints, the _get_current_user rejection branches, and
the websocket authenticator.

The whole suite authenticates by minting tokens directly (conftest.authenticate),
which bypasses /login and the deps rejection branches. This file is the only place
that drives the real login flow and every rejection path end to end.

A known production bug is pinned here with strict xfail (see DISCOVERED_BUGS.md BUG-001).
Do not "fix" it by weakening the assertion -- the code is to be fixed on a separate branch,
at which point the marker is removed.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import get_ws_user
from app.core.security import create_access_token
from app.models.onboarding_application import ApplicationStatus
from app.models.tenant import TenantRole
from app.models.token import RefreshToken
from app.models.user import RoleEnum, User
from app.services.auth_service import _hash_token
from tests.factories import (
    OnboardingApplicationFactory,
    TenantFactory,
    UserFactory,
)
from tests.utils import API

pytestmark = pytest.mark.integration

LOGIN = f"{API}/auth/login"
REFRESH = f"{API}/auth/refresh"
LOGOUT = f"{API}/auth/logout"
ME = f"{API}/auth/me"
PASSWORD = "correct-horse-battery-staple"

# A route guarded by the strict _get_current_user (the variant with every rejection
# branch). Used to exercise deps without going through /me, which deliberately admits
# inactive and suspended users.
GUARDED = f"{API}/orders"


def _encode(**claims) -> str:
    """Build a raw JWT with arbitrary claims, signed with the app's real key unless
    a `key` override is given. For forging the malformed tokens deps must reject."""
    key = claims.pop("key", settings.jwt_secret_key)
    payload = {
        "sub": str(uuid.uuid4()),
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "jti": str(uuid.uuid4()),
    }
    payload.update(claims)
    return jwt.encode(payload, key, algorithm=settings.jwt_algorithm)


# --------------------------------------------------------------------------- #
# POST /auth/login
# --------------------------------------------------------------------------- #


class TestLogin:
    async def test_valid_credentials_return_a_token_pair(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        await UserFactory.create(
            db, tenant=t, email="owner@example.test", password=PASSWORD,
            roles=(RoleEnum.vendor,),
        )

        r = await client.post(LOGIN, json={"email": "owner@example.test", "password": PASSWORD})

        assert r.status_code == 200
        body = r.json()
        assert body["access_token"] and body["refresh_token"]
        assert body["token_type"] == "bearer"

    async def test_email_is_matched_case_insensitively(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        await UserFactory.create(db, tenant=t, email="mixed@example.test", password=PASSWORD)

        r = await client.post(LOGIN, json={"email": "MIXED@EXAMPLE.TEST", "password": PASSWORD})

        assert r.status_code == 200
        assert r.json()["access_token"]

    async def test_wrong_password_is_rejected(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        await UserFactory.create(db, tenant=t, email="owner@example.test", password=PASSWORD)

        r = await client.post(LOGIN, json={"email": "owner@example.test", "password": "nope"})

        assert r.status_code == 401
        assert "access_token" not in r.json()

    async def test_unknown_email_is_rejected(self, client):
        r = await client.post(LOGIN, json={"email": "ghost@example.test", "password": PASSWORD})

        assert r.status_code == 401

    async def test_user_without_a_password_cannot_login(self, db, client):
        """A user provisioned without a password (invite not yet accepted) is not a
        login shortcut -- authenticate_user returns None on empty hashed_password."""
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        await UserFactory.create(db, tenant=t, email="nopass@example.test", password=None)

        r = await client.post(LOGIN, json={"email": "nopass@example.test", "password": ""})

        assert r.status_code == 401

    async def test_suspended_tenant_returns_a_suspended_status_not_a_bare_token(
        self, db, client
    ):
        """Login must succeed so the frontend can route to the suspension screen, but
        the body is the suspended envelope, not a plain TokenResponse."""
        t = await TenantFactory.create(db, role=TenantRole.vendor, is_active=False)
        await UserFactory.create(db, tenant=t, email="susp@example.test", password=PASSWORD)

        r = await client.post(LOGIN, json={"email": "susp@example.test", "password": PASSWORD})

        assert r.status_code == 200
        assert r.json()["status"] == "suspended"

    async def test_pending_application_returns_a_pending_status(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        u = await UserFactory.create(
            db, tenant=t, email="pend@example.test", password=PASSWORD, is_active=False
        )
        await OnboardingApplicationFactory.create(
            db, user=u, status=ApplicationStatus.pending, role="vendor"
        )

        r = await client.post(LOGIN, json={"email": "pend@example.test", "password": PASSWORD})

        assert r.status_code == 200
        assert r.json()["status"] == "pending"
        assert r.json()["role"] == "vendor"

    async def test_pre_pending_application_returns_a_pre_pending_status(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        u = await UserFactory.create(
            db, tenant=t, email="prep@example.test", password=PASSWORD, is_active=False
        )
        await OnboardingApplicationFactory.create(
            db, user=u, status=ApplicationStatus.pre_pending, role="driver"
        )

        r = await client.post(LOGIN, json={"email": "prep@example.test", "password": PASSWORD})

        assert r.status_code == 200
        assert r.json()["status"] == "pre_pending"

    async def test_approved_but_inactive_user_is_auto_activated_on_login(self, db, client):
        """authenticate_user flips is_active True when an approved application exists,
        so an approved user who was left inactive can still log in."""
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        u = await UserFactory.create(
            db, tenant=t, email="appr@example.test", password=PASSWORD, is_active=False
        )
        await OnboardingApplicationFactory.create(
            db, user=u, status=ApplicationStatus.approved, role="vendor"
        )

        r = await client.post(LOGIN, json={"email": "appr@example.test", "password": PASSWORD})

        assert r.status_code == 200
        assert r.json()["access_token"]
        refreshed = await db.scalar(select(User).where(User.id == u.id))
        assert refreshed.is_active is True


# --------------------------------------------------------------------------- #
# POST /auth/refresh
# --------------------------------------------------------------------------- #


class TestRefresh:
    async def _login(self, db, client, **user_kwargs) -> dict:
        t = user_kwargs.pop("tenant", None) or await TenantFactory.create(db, role=TenantRole.vendor)
        email = user_kwargs.pop("email", f"r-{uuid.uuid4().hex[:8]}@example.test")
        await UserFactory.create(db, tenant=t, email=email, password=PASSWORD, **user_kwargs)
        r = await client.post(LOGIN, json={"email": email, "password": PASSWORD})
        return r.json()

    async def test_valid_refresh_returns_a_new_token_pair(self, db, client):
        tokens = await self._login(db, client)

        r = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})

        assert r.status_code == 200
        assert r.json()["access_token"] and r.json()["refresh_token"]

    async def test_old_refresh_token_is_revoked_after_use(self, db, client):
        """Rotation: the presented refresh token must be single-use. Reusing it after
        a successful refresh is rejected."""
        tokens = await self._login(db, client)
        first = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
        assert first.status_code == 200

        reuse = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})

        assert reuse.status_code == 401

    async def test_unknown_refresh_token_is_rejected(self, client):
        r = await client.post(REFRESH, json={"refresh_token": "not-a-real-token"})

        assert r.status_code == 401

    async def test_expired_refresh_token_is_rejected(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        u = await UserFactory.create(db, tenant=t, password=PASSWORD)
        raw = "expired-raw-token"
        db.add(RefreshToken(
            user_id=u.id,
            token_hash=_hash_token(raw),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        ))
        await db.flush()

        r = await client.post(REFRESH, json={"refresh_token": raw})

        assert r.status_code == 401

    async def test_suspended_tenant_cannot_refresh(self, db, client):
        """A tenant suspended after login must not be able to mint fresh access
        tokens off an old refresh token."""
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        tokens = await self._login(db, client, tenant=t)
        t.is_active = False
        db.add(t)
        await db.flush()

        r = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})

        assert r.status_code == 401


# --------------------------------------------------------------------------- #
# POST /auth/logout
# --------------------------------------------------------------------------- #


class TestLogout:
    async def test_logout_revokes_the_refresh_token(self, db, client):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        await UserFactory.create(db, tenant=t, email="out@example.test", password=PASSWORD)
        tokens = (await client.post(
            LOGIN, json={"email": "out@example.test", "password": PASSWORD}
        )).json()

        logout = await client.post(LOGOUT, json={"refresh_token": tokens["refresh_token"]})
        assert logout.status_code == 204

        reuse = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
        assert reuse.status_code == 401

    async def test_logout_with_unknown_token_still_succeeds(self, client):
        """Logout must not reveal whether a token existed (no enumeration)."""
        r = await client.post(LOGOUT, json={"refresh_token": "never-issued"})

        assert r.status_code == 204


# --------------------------------------------------------------------------- #
# GET /auth/me
# --------------------------------------------------------------------------- #


class TestMe:
    async def test_returns_the_authenticated_identity(self, db, authenticate):
        t = await TenantFactory.create(db, name="Acme", role=TenantRole.vendor)
        user = await UserFactory.create(
            db, tenant=t, email="me@example.test", roles=(RoleEnum.vendor,)
        )

        r = await authenticate(user).get(ME)

        assert r.status_code == 200
        body = r.json()
        assert body["id"] == str(user.id)
        assert body["email"] == "me@example.test"
        assert body["tenant_id"] == str(t.id)
        assert body["tenant_is_active"] is True
        assert body["tenant_role"] == "vendor"
        assert "vendor" in body["roles"]

    async def test_requires_authentication(self, client):
        r = await client.get(ME)

        assert r.status_code == 401

    async def test_inactive_user_can_still_read_me(self, db, authenticate):
        """/me uses the allow-inactive-and-suspended dependency by design, so the
        frontend can show an inactive user their own status."""
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        user = await UserFactory.create(db, tenant=t, is_active=False, roles=(RoleEnum.vendor,))

        r = await authenticate(user).get(ME)

        assert r.status_code == 200
        assert r.json()["id"] == str(user.id)

    async def test_suspended_tenant_user_can_still_read_me(self, db, authenticate):
        t = await TenantFactory.create(db, role=TenantRole.vendor, is_active=False)
        user = await UserFactory.create(db, tenant=t, roles=(RoleEnum.vendor,))

        r = await authenticate(user).get(ME)

        assert r.status_code == 200
        assert r.json()["tenant_is_active"] is False


# --------------------------------------------------------------------------- #
# _get_current_user rejection branches (via a strictly-guarded route)
# --------------------------------------------------------------------------- #


class TestCurrentUserDependency:
    async def test_missing_credentials_are_rejected(self, client):
        r = await client.get(GUARDED)

        assert r.status_code == 401

    @pytest.mark.parametrize(
        "label, token",
        [
            ("wrong_token_type", _encode(type="refresh")),
            ("expired", _encode(exp=datetime.now(timezone.utc) - timedelta(minutes=1))),
            ("bad_signature", _encode(key="a-different-secret-entirely")),
            ("empty_subject", _encode(sub="")),
            ("non_uuid_subject", _encode(sub="not-a-uuid")),
            ("garbage", "not.a.jwt"),
            ("unknown_user", _encode(sub=str(uuid.uuid4()))),
        ],
    )
    async def test_malformed_or_unresolvable_tokens_are_rejected(self, client, label, token):
        r = await client.get(GUARDED, headers={"Authorization": f"Bearer {token}"})

        assert r.status_code == 401, f"{label} should be rejected"

    async def test_inactive_user_is_rejected(self, db, authenticate):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        user = await UserFactory.create(db, tenant=t, is_active=False, roles=(RoleEnum.vendor,))

        r = await authenticate(user).get(GUARDED)

        assert r.status_code == 401

    async def test_suspended_tenant_user_is_rejected(self, db, authenticate):
        t = await TenantFactory.create(db, role=TenantRole.vendor, is_active=False)
        user = await UserFactory.create(db, tenant=t, roles=(RoleEnum.vendor,))

        r = await authenticate(user).get(GUARDED)

        assert r.status_code == 401

    @pytest.mark.xfail(
        strict=True,
        reason="SECURITY (DISCOVERED_BUGS.md BUG-001): a user whose tenant was deleted "
        "keeps a valid session. user.tenant_id is FK ondelete=SET NULL, so deleting the "
        "tenant nulls it rather than dangling; the user then passes the `if user.tenant_id:` "
        "short-circuit in _get_current_user and is admitted as an unscoped non-admin (which "
        "also feeds the get_orders leak, BUG-004). A non-platform-admin with no tenant should "
        "not be a valid session. Remove this marker once deps rejects it.",
    )
    async def test_user_whose_tenant_was_deleted_is_rejected(self, db, authenticate):
        t = await TenantFactory.create(db, role=TenantRole.vendor)
        user = await UserFactory.create(db, tenant=t, roles=(RoleEnum.vendor,))
        await db.delete(t)
        await db.flush()

        r = await authenticate(user).get(GUARDED)

        assert r.status_code == 401


# --------------------------------------------------------------------------- #
# Websocket authenticator (get_ws_user)
# --------------------------------------------------------------------------- #


def _ws(token: str | None):
    """A real Starlette WebSocket carrying `token` as the ?token= query param.
    receive/send are inert -- get_ws_user only reads query_params and headers."""
    from starlette.websockets import WebSocket

    query = f"token={token}".encode() if token is not None else b""
    scope = {"type": "websocket", "query_string": query, "headers": []}

    async def _receive():
        return {"type": "websocket.connect"}

    async def _send(_message):
        return None

    return WebSocket(scope, receive=_receive, send=_send)


class TestWebsocketAuth:
    async def test_valid_token_resolves_the_user(self, db):
        t = await TenantFactory.create(db, role=TenantRole.driver)
        user = await UserFactory.create(db, tenant=t, roles=(RoleEnum.driver,))

        resolved = await get_ws_user(_ws(create_access_token(str(user.id))), db)

        assert resolved is not None
        assert resolved.id == user.id

    async def test_missing_token_returns_none(self, db):
        assert await get_ws_user(_ws(None), db) is None

    async def test_inactive_user_returns_none(self, db):
        t = await TenantFactory.create(db, role=TenantRole.driver)
        user = await UserFactory.create(db, tenant=t, is_active=False, roles=(RoleEnum.driver,))

        assert await get_ws_user(_ws(create_access_token(str(user.id))), db) is None

    # get_ws_user does not check tenant suspension, unlike _get_current_user -- a driver on
    # a suspended tenant keeps a live websocket. Not pinned: ws.py is being abandoned (see
    # apps/api/tests/testing_todo.md, dropped T17), so this gap is not worth tracking.
