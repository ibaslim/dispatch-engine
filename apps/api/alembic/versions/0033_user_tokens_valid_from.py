"""Add users.tokens_valid_from for immediate access-token revocation.

Access tokens are stateless JWTs valid for access_token_expire_minutes, so
revoking a refresh token leaves the access token usable until it expires. This
column is compared against the token's `iat` claim on each authenticated
request, which closes that window without a new dependency or a JWT change.

NULL means "never revoked", so the check is a no-op for every existing session
and this migration is safe to deploy ahead of the code that writes it.

Revision ID: 0033
Revises: 0032
Create Date: 2026-08-05 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}

    if "tokens_valid_from" not in columns:
        # Deliberately no backfill: NULL keeps every issued token valid.
        op.add_column(
            "users",
            sa.Column("tokens_valid_from", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("users")}

    if "tokens_valid_from" in columns:
        op.drop_column("users", "tokens_valid_from")
