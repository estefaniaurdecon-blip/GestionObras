"""fix_work_report_attachment_id_fk

Cambio: WorkReportAttachment.work_report_id de VARCHAR(128) a INTEGER con FK CASCADE
a erp_work_report.id.

PRE-FLIGHT OBLIGATORIO antes de aplicar en produccion:

    -- 1. Adjuntos con work_report_id no numerico (deben ser 0 filas)
    SELECT id, work_report_id, tenant_id
    FROM erp_work_report_attachment
    WHERE work_report_id !~ '^\\d+$';

    -- 2. Adjuntos con work_report_id numerico pero parte inexistente (deben ser 0 filas)
    SELECT a.id, a.work_report_id, a.tenant_id
    FROM erp_work_report_attachment a
    LEFT JOIN erp_work_report wr ON wr.id = a.work_report_id::integer
    WHERE a.work_report_id ~ '^\\d+$'
      AND wr.id IS NULL;

Si alguna query devuelve filas, resolver manualmente antes de correr la migracion.

Revision ID: a1b2c3d4e5f6
Revises: 6b7e2f6c4d1a
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "6b7e2f6c4d1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Paso 1: convertir columna VARCHAR -> INTEGER
    # postgresql_using hace el cast explicito; falla si hay valores no numericos
    op.alter_column(
        "erp_work_report_attachment",
        "work_report_id",
        type_=sa.Integer(),
        postgresql_using="work_report_id::integer",
        nullable=False,
    )

    # Paso 2: anadir FK con CASCADE
    # CASCADE: al borrar un WorkReport, sus adjuntos en BD se eliminan automaticamente.
    # Los archivos fisicos en disco deben limpiarse desde la aplicacion (pendiente).
    op.create_foreign_key(
        "fk_work_report_attachment_report_id",
        "erp_work_report_attachment",
        "erp_work_report",
        ["work_report_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_work_report_attachment_report_id",
        "erp_work_report_attachment",
        type_="foreignkey",
    )
    op.alter_column(
        "erp_work_report_attachment",
        "work_report_id",
        type_=sa.String(length=128),
        postgresql_using="work_report_id::varchar",
        nullable=False,
    )
