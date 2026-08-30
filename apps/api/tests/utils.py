"""Shared helpers for tests. Keep this small: fixtures belong in conftest.py."""
from app.core.security import create_access_token
from app.models.user import User

# Every router is mounted under this prefix in app.main.create_app.
API = "/api/v1"


def auth_header(user: User) -> dict[str, str]:
    """Bearer header for `user`. Prefer the *_client fixtures; use this when a
    test needs a second actor on the same request sequence."""
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


def assert_not_found(response) -> None:
    """Assert a cross-tenant read was refused without confirming existence.

    A 403 here would leak that the resource exists in another tenant, so that
    is a product bug rather than an acceptable alternative.
    """
    assert response.status_code == 404, (
        f"expected 404 for a cross-tenant read, got {response.status_code}: "
        f"{response.text[:200]}"
    )