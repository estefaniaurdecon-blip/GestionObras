"""drop_contract_comparative_status

Revision ID: 6b7e2f6c4d1a
Revises: 94028fe989f1
Create Date: 2026-03-10 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6b7e2f6c4d1a"
down_revision: Union[str, None] = "94028fe989f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("contract", "comparative_status")


def downgrade() -> None:
    op.add_column(
        "contract",
        sa.Column(
            "comparative_status",
            sa.String(length=32),
            nullable=False,
            server_default="DRAFT",
        ),
    )
