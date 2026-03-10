"""add_index_and_fk_contract_supplier_id

Revision ID: 94028fe989f1
Revises: f38d731a42ae
Create Date: 2026-03-10 13:20:51.216728

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '94028fe989f1'
down_revision: Union[str, None] = 'f38d731a42ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_contract_supplier_id",
        "contract",
        ["supplier_id"],
    )
    op.create_foreign_key(
        "fk_contract_supplier_id",
        "contract",
        "supplier",
        ["supplier_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_contract_supplier_id", "contract", type_="foreignkey")
    op.drop_index("ix_contract_supplier_id", table_name="contract")
