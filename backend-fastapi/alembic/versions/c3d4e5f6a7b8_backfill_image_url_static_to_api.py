"""backfill_image_url_static_to_api

Etapa C — corte definitivo del mount público /static/work-report-images/.

Sustituye el prefijo legacy en image_url de erp_work_report_attachment:
  /static/work-report-images/  →  /api/v1/work-reports/images/

PRE-FLIGHT OBLIGATORIO antes de aplicar en produccion:

    -- A) work_report_id no numéricos (debe ser 0 filas; si hay filas, aplicar a1b2c3d4e5f6 primero)
    SELECT id, work_report_id, tenant_id
    FROM erp_work_report_attachment
    WHERE work_report_id::text !~ '^[0-9]+$';

    -- B) Adjuntos huérfanos (sin parte padre en mismo tenant)
    SELECT a.id, a.work_report_id, a.tenant_id, a.created_at
    FROM erp_work_report_attachment a
    LEFT JOIN erp_work_report r
        ON r.id = a.work_report_id AND r.tenant_id = a.tenant_id
    WHERE r.id IS NULL
    ORDER BY a.tenant_id, a.created_at;

    -- C) URLs legacy pendientes de backfill (el número que esta migración debe limpiar)
    SELECT COUNT(*) AS pending_backfill
    FROM erp_work_report_attachment
    WHERE image_url LIKE '%/static/work-report-images/%';

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LEGACY_PREFIX = "/static/work-report-images/"
_NEW_PREFIX = "/api/v1/work-reports/images/"


def upgrade() -> None:
    conn = op.get_bind()

    # Pre-flight en upgrade: abortar si quedan work_report_id no numéricos
    # (solo relevante en PostgreSQL; en SQLite este check se omite)
    dialect = conn.dialect.name
    if dialect == "postgresql":
        bad_ids = conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM erp_work_report_attachment"
                " WHERE work_report_id::text !~ '^[0-9]+$'"
            )
        ).scalar()
        if bad_ids:
            raise RuntimeError(
                f"Pre-flight fallido: {bad_ids} fila(s) con work_report_id no numerico. "
                "Aplicar migración a1b2c3d4e5f6 y resolver manualmente antes de continuar."
            )

    # Backfill: reemplazar prefijo legacy por ruta autenticada
    result = conn.execute(
        sa.text(
            "UPDATE erp_work_report_attachment"
            " SET image_url = REPLACE(image_url, :legacy, :new_prefix),"
            "     updated_at = NOW()"
            " WHERE image_url LIKE :pattern"
        ),
        {"legacy": _LEGACY_PREFIX, "new_prefix": _NEW_PREFIX, "pattern": f"%{_LEGACY_PREFIX}%"},
    )

    affected = result.rowcount if result.rowcount is not None else -1
    print(f"  [backfill] image_url actualizadas: {affected} fila(s)")

    # Verificacion post-update: no deben quedar URLs legacy
    remaining = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM erp_work_report_attachment"
            " WHERE image_url LIKE :pattern"
        ),
        {"pattern": f"%{_LEGACY_PREFIX}%"},
    ).scalar()

    if remaining:
        raise RuntimeError(
            f"Backfill incompleto: {remaining} fila(s) aún con prefijo legacy. Revisar manualmente."
        )


def downgrade() -> None:
    # Revertir: sustituir prefijo API por prefijo legacy.
    # Solo útil si se restaura el mount /static/work-report-images/ en main.py.
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE erp_work_report_attachment"
            " SET image_url = REPLACE(image_url, :new_prefix, :legacy),"
            "     updated_at = NOW()"
            " WHERE image_url LIKE :pattern"
        ),
        {"new_prefix": _NEW_PREFIX, "legacy": _LEGACY_PREFIX, "pattern": f"%{_NEW_PREFIX}%"},
    )
