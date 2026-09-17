"""Record how a driver verified the parcel at pickup.

Verification used to be a client-side string comparison against the shipping
label's QR code, with nothing persisted. Senders without a printer have no
label to scan, so pickup now accepts a photo of the parcel as well and the
chosen method is stored for audit.

Revision ID: 0037
Revises: 0036
Create Date: 2026-09-10 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if "pickup_verification" not in _columns("orders"):
        op.add_column("orders", sa.Column("pickup_verification", sa.JSON(), nullable=True))


def downgrade() -> None:
    if "pickup_verification" in _columns("orders"):
        op.drop_column("orders", "pickup_verification")
