"""Harden push_tokens: one row per device, plus a last-seen timestamp.

Registration becomes an upsert keyed on the token (the old replace-all broke
two-device drivers), which needs a unique constraint to be concurrency-safe.

Revision ID: 0032
Revises: 0031
Create Date: 2026-08-05 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("push_tokens")}
    if "last_seen_at" not in columns:
        op.add_column(
            "push_tokens",
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        )
        # Seed from created_at so the column isn't uselessly all-NULL.
        op.execute("UPDATE push_tokens SET last_seen_at = created_at WHERE last_seen_at IS NULL")

    # Dedupe before the unique index. Duplicates are the same physical device,
    # so keeping the newest loses no registration.
    op.execute(
        """
        DELETE FROM push_tokens a
        USING push_tokens b
        WHERE a.token = b.token
          AND (
            a.created_at < b.created_at
            OR (a.created_at = b.created_at AND a.id < b.id)
          )
        """
    )

    existing = {ix["name"] for ix in inspector.get_indexes("push_tokens")}
    if "ux_push_tokens_token" not in existing:
        op.create_index("ux_push_tokens_token", "push_tokens", ["token"], unique=True)

    # Every fan-out filters on is_active; otherwise it's a seq scan per publish.
    if "ix_push_tokens_user_active" not in existing:
        op.create_index(
            "ix_push_tokens_user_active", "push_tokens", ["user_id", "is_active"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {ix["name"] for ix in inspector.get_indexes("push_tokens")}

    if "ix_push_tokens_user_active" in existing:
        op.drop_index("ix_push_tokens_user_active", table_name="push_tokens")
    if "ux_push_tokens_token" in existing:
        op.drop_index("ux_push_tokens_token", table_name="push_tokens")

    columns = {col["name"] for col in inspector.get_columns("push_tokens")}
    if "last_seen_at" in columns:
        op.drop_column("push_tokens", "last_seen_at")