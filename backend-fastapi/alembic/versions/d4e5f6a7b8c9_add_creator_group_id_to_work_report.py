"""add_creator_group_id_to_work_report

Fase 2a: añade creator_group_id (nullable) a erp_work_report e índice compuesto
(tenant_id, creator_group_id).

NO activa ningún filtro de visibilidad por grupo.
El filtro se activará en Fase 2c, tras completar el backfill de partes legacy.

PRECONDICIÓN de despliegue: ninguna — la columna es nullable y no rompe escrituras
ni lecturas existentes. Aplicable en caliente sin ventana de mantenimiento.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "erp_work_report",
        sa.Column("creator_group_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_erp_work_report_tenant_group",
        "erp_work_report",
        ["tenant_id", "creator_group_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_erp_work_report_tenant_group", table_name="erp_work_report")
    op.drop_column("erp_work_report", "creator_group_id")
