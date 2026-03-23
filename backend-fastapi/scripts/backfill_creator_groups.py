"""
Fase 2c — Script de auditoría y backfill de creator_group_id.

Propósito:
  - Auditar usuarios legacy con creator_group_id IS NULL
  - Auditar partes de obra legacy con creator_group_id IS NULL
  - Clasificar por categoría de resolución
  - Aplicar backfill seguro en dry_run=False

Uso:
  # Solo auditoría (sin escribir nada):
  python -m scripts.backfill_creator_groups --dry-run

  # Aplicar solo automáticos (Categoría 1):
  python -m scripts.backfill_creator_groups --apply-auto

  # Aplicar automáticos + last_resort:
  python -m scripts.backfill_creator_groups --apply-auto --apply-last-resort

  # Ver informe de semi_auto / manual sin escribir:
  python -m scripts.backfill_creator_groups --dry-run --verbose

Variables de entorno requeridas (o .env en raíz del backend):
  DATABASE_URL  (ej. postgresql://user:pass@localhost:5432/dbname)

IMPORTANTE: Ejecutar SIEMPRE con --dry-run primero.
No activa el filtro de grupo en list_work_reports(). Eso es Fase 2d.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

# Añadir backend-fastapi al path para importar la app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, create_engine, select

from app.models.user import User
from app.models.erp import WorkReport
from app.models.audit_log import AuditLog
from app.services.user_service import resolve_creator_group_id


# ---------------------------------------------------------------------------
# Helpers de auditoría
# ---------------------------------------------------------------------------

def _count_audit_matches_for_user(session: Session, user: User) -> int:
    """
    Cuenta entradas en audit_log con action='user.create' que referencian
    a este usuario, ya sea por JSON estructurado (campo created_user_id)
    o por substring legacy del email.

    Ventana temporal: ±5 minutos del user.created_at.
    """
    if not user.id or not user.tenant_id:
        return 0

    window_start = user.created_at - timedelta(minutes=5)
    window_end = user.created_at + timedelta(minutes=5)

    audit_rows = session.exec(
        select(AuditLog)
        .where(
            AuditLog.action == "user.create",
            AuditLog.tenant_id == user.tenant_id,
            AuditLog.created_at >= window_start,
            AuditLog.created_at <= window_end,
        )
    ).all()

    matches = 0
    normalized_email = (user.email or "").strip().lower()

    for row in audit_rows:
        if row.user_id == user.id:
            continue  # el propio usuario no cuenta como "creador"

        # Intento 1: JSON estructurado (registros nuevos)
        try:
            data = json.loads(row.details or "{}")
            if data.get("created_user_id") == user.id:
                matches += 1
                continue
        except (json.JSONDecodeError, TypeError):
            pass

        # Intento 2: substring legacy
        if normalized_email and normalized_email in (row.details or "").strip().lower():
            matches += 1

    return matches


def _get_audit_creator_user_id(session: Session, user: User) -> Optional[int]:
    """
    Devuelve el user_id del creador si hay exactamente 1 match en audit_log.
    Retorna None si hay 0 o más de 1 matches.
    """
    if not user.id or not user.tenant_id:
        return None

    window_start = user.created_at - timedelta(minutes=5)
    window_end = user.created_at + timedelta(minutes=5)

    audit_rows = session.exec(
        select(AuditLog)
        .where(
            AuditLog.action == "user.create",
            AuditLog.tenant_id == user.tenant_id,
            AuditLog.created_at >= window_start,
            AuditLog.created_at <= window_end,
        )
    ).all()

    normalized_email = (user.email or "").strip().lower()
    found_creator_ids: list[int] = []

    for row in audit_rows:
        if row.user_id == user.id:
            continue

        matched = False
        try:
            data = json.loads(row.details or "{}")
            if data.get("created_user_id") == user.id:
                matched = True
        except (json.JSONDecodeError, TypeError):
            pass

        if not matched and normalized_email and normalized_email in (row.details or "").strip().lower():
            matched = True

        if matched and row.user_id is not None:
            creator_id = int(row.user_id)
            if creator_id not in found_creator_ids:
                found_creator_ids.append(creator_id)

    if len(found_creator_ids) == 1:
        return found_creator_ids[0]
    return None


# ---------------------------------------------------------------------------
# Clasificación de usuarios
# ---------------------------------------------------------------------------

CATEGORY_AUTO = "auto"            # Categoría 1: backfill directo seguro
CATEGORY_SEMI_AUTO = "semi_auto"  # Categoría 2: requiere revisión antes de escribir
CATEGORY_MANUAL = "manual"        # Categoría 3: revisión manual obligatoria
CATEGORY_LAST_RESORT = "last_resort"  # Categoría 4: auto-grupo cuando condiciones aplican


def classify_user_for_backfill(session: Session, user: User) -> tuple[str, str]:
    """
    Clasifica un usuario sin creator_group_id.

    Retorna: (category, reason)
      category: 'auto' | 'semi_auto' | 'manual' | 'last_resort'
      reason: descripción textual del motivo de clasificación
    """
    if user.created_by_user_id:
        creator = session.get(User, user.created_by_user_id)

        if creator is None:
            # FK rota: usuario eliminado sin rastro
            return CATEGORY_MANUAL, f"created_by_user_id={user.created_by_user_id} no existe en DB (usuario eliminado)"

        if creator.is_super_admin:
            # Decisión de negocio: ¿a qué grupo asignar un usuario creado por super_admin?
            return CATEGORY_MANUAL, f"creado por super_admin (id={creator.id}) — decisión de negocio requerida"

        if creator.creator_group_id is not None:
            # Cadena directa resuelta: resolve_creator_group_id() devolverá creator.creator_group_id
            return CATEGORY_AUTO, f"cadena directa: creator.id={creator.id}, creator.creator_group_id={creator.creator_group_id}"

        # Creador existe pero también tiene creator_group_id=NULL -> cadena incompleta
        # Intentar resolver recursivamente via resolve_creator_group_id()
        resolved = resolve_creator_group_id(session, creator, persist=False)
        if resolved is not None:
            return CATEGORY_SEMI_AUTO, (
                f"cadena incompleta: creator.id={creator.id} también NULL, "
                f"pero resolve() devuelve {resolved} — verificar profundidad"
            )
        return CATEGORY_SEMI_AUTO, (
            f"cadena incompleta: creator.id={creator.id} también NULL y resolve() no resuelve — revisar manualmente"
        )

    # Sin created_by_user_id — buscar en audit_log
    matches = _count_audit_matches_for_user(session, user)

    if matches == 1:
        creator_id = _get_audit_creator_user_id(session, user)
        if creator_id:
            audit_creator = session.get(User, creator_id)
            if audit_creator and not audit_creator.is_super_admin and audit_creator.creator_group_id is not None:
                return CATEGORY_SEMI_AUTO, (
                    f"sin created_by, 1 match en audit_log: creator_id={creator_id}, "
                    f"creator.creator_group_id={audit_creator.creator_group_id} — alta confianza, revisar lista"
                )
            return CATEGORY_SEMI_AUTO, (
                f"sin created_by, 1 match en audit_log: creator_id={creator_id} — "
                f"creator tiene group=NULL o es super_admin, revisar"
            )
        return CATEGORY_SEMI_AUTO, "sin created_by, 1 match en audit_log pero no se pudo extraer creator_id"

    if matches > 1:
        return CATEGORY_MANUAL, f"sin created_by, {matches} matches en audit_log — ambigüedad, revisar manualmente"

    # Sin ningún rastro — evaluar condiciones para last_resort
    # Condición 1: tenant_admin (tiene su propia jerarquía por diseño)
    role_name = _get_role_name(session, user)
    if role_name and "admin" in role_name.lower():
        return CATEGORY_LAST_RESORT, f"tenant_admin (role={role_name}) sin creador conocido — auto-grupo aceptable por diseño"

    # Condición 2: nunca activado (is_active=False desde creación)
    if not user.is_active:
        return CATEGORY_LAST_RESORT, "usuario inactivo (nunca completó onboarding) sin rastro — auto-grupo aceptable"

    # Condición 3: único usuario del tenant
    tenant_user_count = _count_tenant_users(session, user.tenant_id)
    if tenant_user_count == 1:
        return CATEGORY_LAST_RESORT, f"único usuario del tenant_id={user.tenant_id} sin rastro — auto-grupo aceptable"

    # Usuario activo sin ningún rastro: NO asumir
    return CATEGORY_MANUAL, "usuario activo sin created_by, sin matches en audit_log — no asumir grupo, requiere revisión manual"


def _get_role_name(session: Session, user: User) -> Optional[str]:
    from app.models.user_app_role import UserAppRole
    stmt = (
        select(UserAppRole.role)
        .where(
            UserAppRole.user_id == user.id,
            UserAppRole.tenant_id == user.tenant_id,
        )
        .limit(1)
    )
    result = session.exec(stmt).first()
    return result


def _count_tenant_users(session: Session, tenant_id: Optional[int]) -> int:
    if not tenant_id:
        return 0
    from sqlalchemy import func
    stmt = select(func.count(User.id)).where(
        User.tenant_id == tenant_id,
        User.is_super_admin.is_(False),
    )
    result = session.exec(stmt).first()
    return result or 0


# ---------------------------------------------------------------------------
# Backfill de usuarios
# ---------------------------------------------------------------------------

def run_users_backfill(
    session: Session,
    dry_run: bool = True,
    apply_auto: bool = True,
    apply_last_resort: bool = False,
    verbose: bool = False,
) -> dict:
    """
    Clasifica y opcionalmente aplica backfill a usuarios con creator_group_id IS NULL.

    En dry_run=True: solo clasifica, no escribe.
    En dry_run=False + apply_auto=True: aplica Categoría 1 automáticamente.
    En dry_run=False + apply_last_resort=True: aplica Categoría 4 (auto-grupo).
    Categorías 2 y 3 NUNCA se aplican automáticamente.
    """
    users = session.exec(
        select(User).where(
            User.creator_group_id.is_(None),
            User.is_super_admin.is_(False),
            User.tenant_id.is_not(None),
        )
    ).all()

    report: dict = {
        "total_legacy": len(users),
        "dry_run": dry_run,
        CATEGORY_AUTO: [],
        CATEGORY_SEMI_AUTO: [],
        CATEGORY_MANUAL: [],
        CATEGORY_LAST_RESORT: [],
        "applied_auto": 0,
        "applied_last_resort": 0,
        "errors": [],
    }

    for user in users:
        category, reason = classify_user_for_backfill(session, user)
        entry = {
            "user_id": user.id,
            "email": user.email,
            "tenant_id": user.tenant_id,
            "created_by_user_id": user.created_by_user_id,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "reason": reason,
        }
        report[category].append(entry)

        if verbose:
            print(f"  [{category.upper():12s}] user_id={user.id} ({user.email}) — {reason}")

        if dry_run:
            continue

        # --- Aplicar Categoría 1 (automático seguro) ---
        if category == CATEGORY_AUTO and apply_auto:
            try:
                resolved = resolve_creator_group_id(session, user, persist=True)
                if resolved is not None:
                    report["applied_auto"] += 1
                    if verbose:
                        print(f"    -> APLICADO auto: user_id={user.id} creator_group_id={resolved}")
                else:
                    report["errors"].append({
                        "user_id": user.id,
                        "error": "resolve_creator_group_id() devolvió None en categoría auto",
                    })
            except Exception as exc:
                report["errors"].append({"user_id": user.id, "error": str(exc)})

        # --- Aplicar Categoría 4 (auto-grupo, solo condiciones explícitas) ---
        elif category == CATEGORY_LAST_RESORT and apply_last_resort:
            try:
                if user.id is not None:
                    user.creator_group_id = user.id
                    session.add(user)
                    report["applied_last_resort"] += 1
                    if verbose:
                        print(f"    -> APLICADO last_resort: user_id={user.id} creator_group_id={user.id} (auto-grupo)")
            except Exception as exc:
                report["errors"].append({"user_id": user.id, "error": str(exc)})

    if not dry_run:
        session.commit()

    return report


# ---------------------------------------------------------------------------
# Backfill de partes de obra (WorkReport)
# ---------------------------------------------------------------------------

def run_work_reports_backfill(
    session: Session,
    dry_run: bool = True,
    verbose: bool = False,
) -> dict:
    """
    Backfill seguro de creator_group_id en WorkReport.

    Solo aplica cuando el creador (created_by_id) tiene creator_group_id ya resuelto.
    No aplica resolución recursiva para no asumir grupos en cadenas incompletas.

    Equivalente a Categoría 1 para usuarios: copia directa creator -> parte.
    """
    reports_pending = session.exec(
        select(WorkReport).where(WorkReport.creator_group_id.is_(None))
    ).all()

    result: dict = {
        "total_pending": len(reports_pending),
        "dry_run": dry_run,
        "resolved": 0,
        "unresolved": [],
        "errors": [],
    }

    for report in reports_pending:
        if not report.created_by_id:
            result["unresolved"].append({
                "report_id": report.id,
                "tenant_id": report.tenant_id,
                "created_by_id": None,
                "reason": "created_by_id IS NULL — parte sin creador identificado",
            })
            if verbose:
                print(f"  [UNRESOLVED] report_id={report.id} — sin created_by_id")
            continue

        creator = session.get(User, report.created_by_id)

        if creator is None:
            result["unresolved"].append({
                "report_id": report.id,
                "tenant_id": report.tenant_id,
                "created_by_id": report.created_by_id,
                "reason": f"created_by_id={report.created_by_id} no existe en DB (usuario eliminado)",
            })
            if verbose:
                print(f"  [UNRESOLVED] report_id={report.id} — creator eliminado (id={report.created_by_id})")
            continue

        if creator.is_super_admin:
            result["unresolved"].append({
                "report_id": report.id,
                "tenant_id": report.tenant_id,
                "created_by_id": report.created_by_id,
                "reason": f"creador es super_admin (id={creator.id}) — parte sin grupo asignable automáticamente",
            })
            if verbose:
                print(f"  [UNRESOLVED] report_id={report.id} — creado por super_admin")
            continue

        if creator.creator_group_id is None:
            result["unresolved"].append({
                "report_id": report.id,
                "tenant_id": report.tenant_id,
                "created_by_id": report.created_by_id,
                "reason": (
                    f"creator.id={creator.id} aún tiene creator_group_id=NULL — "
                    "backfill de usuarios debe ejecutarse primero"
                ),
            })
            if verbose:
                print(
                    f"  [UNRESOLVED] report_id={report.id} — "
                    f"creator_id={creator.id} aún sin grupo (ejecutar backfill de usuarios primero)"
                )
            continue

        # Backfill seguro: copia directa
        if verbose:
            print(
                f"  [RESOLVED]   report_id={report.id} -> "
                f"creator_group_id={creator.creator_group_id} (from creator_id={creator.id})"
            )

        if not dry_run:
            try:
                report.creator_group_id = creator.creator_group_id
                session.add(report)
                result["resolved"] += 1
            except Exception as exc:
                result["errors"].append({"report_id": report.id, "error": str(exc)})
        else:
            result["resolved"] += 1  # cuenta lo que se resolvería

    if not dry_run and result["resolved"] > 0:
        session.commit()

    return result


# ---------------------------------------------------------------------------
# Consultas SQL de auditoría inicial (referencia para ejecutar directamente en DB)
# ---------------------------------------------------------------------------

AUDIT_QUERIES = """
-- [Q1] Usuarios non-super-admin sin creator_group_id
SELECT id, email, tenant_id, created_by_user_id, is_active, created_at
FROM "user"
WHERE creator_group_id IS NULL
  AND is_super_admin = FALSE
  AND tenant_id IS NOT NULL
ORDER BY tenant_id, created_at;

-- [Q2] Partes de obra sin creator_group_id (requiere migración d4e5f6a7b8c9 aplicada)
SELECT wr.id, wr.tenant_id, wr.created_by_id,
       u.email AS creator_email,
       u.creator_group_id AS creator_group
FROM erp_work_report wr
LEFT JOIN "user" u ON wr.created_by_id = u.id
WHERE wr.creator_group_id IS NULL
  AND wr.deleted_at IS NULL
ORDER BY wr.tenant_id, wr.created_at;

-- [Q3] Adjuntos huérfanos (work_report_id no referencia parte existente)
SELECT a.id, a.work_report_id, a.tenant_id, a.file_name
FROM erp_work_report_attachment a
LEFT JOIN erp_work_report wr ON wr.id = a.work_report_id
WHERE wr.id IS NULL;

-- [Q4] Usuarios por categoría estimada (sin resolver, solo conteo rápido)
SELECT
  CASE
    WHEN created_by_user_id IS NOT NULL THEN 'tiene_created_by'
    ELSE 'sin_created_by'
  END AS tipo,
  COUNT(*) AS total
FROM "user"
WHERE creator_group_id IS NULL
  AND is_super_admin = FALSE
  AND tenant_id IS NOT NULL
GROUP BY 1;

-- [Q5] Cobertura tras backfill (ejecutar después de aplicar)
SELECT
  COUNT(*) FILTER (WHERE creator_group_id IS NOT NULL) AS con_grupo,
  COUNT(*) FILTER (WHERE creator_group_id IS NULL) AS sin_grupo,
  COUNT(*) AS total
FROM "user"
WHERE is_super_admin = FALSE AND tenant_id IS NOT NULL;

-- [Q6] Cobertura partes tras backfill
SELECT
  COUNT(*) FILTER (WHERE creator_group_id IS NOT NULL) AS con_grupo,
  COUNT(*) FILTER (WHERE creator_group_id IS NULL) AS sin_grupo,
  COUNT(*) AS total
FROM erp_work_report
WHERE deleted_at IS NULL;
"""


# ---------------------------------------------------------------------------
# Informe de cierre de Fase 2c
# ---------------------------------------------------------------------------

PHASE_2C_CLOSURE_CRITERIA = """
Criterios para dar Fase 2c por cerrada y pasar a Fase 2d:
---------------------------------------------------------
1. PASO 1 — apply-auto completado:
   - Categoría 1 (auto): 100% aplicada, 0 errores en report["applied_auto"]
   - Semi-auto y manual: listados, cada caso revisado individualmente

2. PASO 2 — apply-work-reports completado:
   - Backfill aplicado en todos los partes cuyo creador tiene grupo ya resuelto
   - 0 errores en report["errors"]

3. PASO 3 — apply-last-resort (solo si necesario y documentado):
   - Aplicar SOLO cuando cada caso last_resort haya sido revisado: confirmar que
     el usuario es tenant_admin sin creador conocido, o inactivo, o único del tenant
   - NO aplicar a usuarios activos con partes de obra asociados sin revisar antes

4. CASOS RESTANTES CON NULL — todos deben estar identificados:
   - Cada usuario con creator_group_id=NULL tras los 3 pasos debe tener una de estas:
     a) Es super_admin (NULL por diseño — no afecta visibilidad operativa)
     b) Es un caso manual documentado con decisión explícita (issue abierto o anotado aquí)
     c) Es un usuario inactivo sin datos operativos (no ha creado partes, mensajes, etc.)
   - NO es aceptable tener NULLs en usuarios activos con partes de obra sin identificar

5. PARTES RESTANTES CON NULL — todos deben estar identificados:
   - Cada parte con creator_group_id=NULL debe corresponder a:
     a) Parte creado por super_admin (NULL por diseño — visible solo para super_admin en Fase 2d)
     b) Parte con FK rota (creator eliminado) — documentado y sin actividad reciente
   - NO es aceptable que partes activos de usuarios normales queden con NULL sin razón documentada

6. CONDICIÓN DE PASO A FASE 2D:
   - Los NULLs restantes no corresponden a usuarios/partes activos con actividad operativa actual
   - La lista de casos pendientes está documentada en SECURITY_REVIEW_GROUP_POLICY.md §8
   - 0 errores en report["errors"] del último pase con --apply-*
   - Verificado con Q5/Q6: los NULLs restantes coinciden exactamente con los casos identificados
   - Comportamiento nuevo verificado: usuarios/partes creados post-Fase-2a tienen creator_group_id

7. NO ACTIVAR todavía:
   - list_work_reports() sin filtro de grupo (Fase 2d)
   - _get_report_or_403() sin validación de grupo para adjuntos (Fase 2d)
   - can_access_work_report() no activa en endpoints (Fase 2d)
"""


# ---------------------------------------------------------------------------
# Runner principal
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Fase 2c — Auditoría y backfill de creator_group_id.\n\n"
            "PASOS OBLIGATORIOS (ejecutar en este orden, uno por uno):\n"
            "  Paso 0: --dry-run --verbose            (auditoría sin escribir)\n"
            "  Paso 1: --apply-auto                   (Categoría 1 usuarios)\n"
            "  Paso 2: --apply-work-reports           (partes de obra)\n"
            "  Paso 3: --apply-last-resort            (solo si necesario y revisado)\n\n"
            "IMPORTANTE: solo un --apply-* por ejecución."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dry-run", action="store_true", default=True,
        help="Solo clasifica, no escribe en DB (default: True — activo salvo que se pase --apply-*)",
    )
    parser.add_argument(
        "--apply-auto", action="store_true", default=False,
        help=(
            "PASO 1: aplicar Categoría 1 (automático seguro) para usuarios. "
            "No toca partes de obra. Incompatible con --apply-work-reports y --apply-last-resort."
        ),
    )
    parser.add_argument(
        "--apply-work-reports", action="store_true", default=False,
        help=(
            "PASO 2: aplicar backfill seguro de partes de obra. "
            "Requiere haber ejecutado --apply-auto antes. "
            "Incompatible con --apply-auto y --apply-last-resort."
        ),
    )
    parser.add_argument(
        "--apply-last-resort", action="store_true", default=False,
        help=(
            "PASO 3: aplicar Categoría 4 (auto-grupo) solo cuando necesario y revisado. "
            "Ejecutar solo después de revisar la lista de last_resort del dry-run. "
            "Incompatible con --apply-auto y --apply-work-reports."
        ),
    )
    parser.add_argument(
        "--show-queries", action="store_true", default=False,
        help="Mostrar consultas SQL de auditoría para ejecutar en DB directamente",
    )
    parser.add_argument(
        "--show-closure-criteria", action="store_true", default=False,
        help="Mostrar criterios de cierre de Fase 2c",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", default=False,
        help="Salida detallada por cada usuario/parte",
    )
    parser.add_argument(
        "--database-url", default=None,
        help="PostgreSQL URL (default: lee DATABASE_URL del entorno)",
    )
    args = parser.parse_args()

    if args.show_queries:
        print(AUDIT_QUERIES)
        return

    if args.show_closure_criteria:
        print(PHASE_2C_CLOSURE_CRITERIA)
        return

    # --- Exclusión mutua: máximo un --apply-* por ejecución ---
    apply_flags = [args.apply_auto, args.apply_work_reports, args.apply_last_resort]
    active_flags = sum(1 for f in apply_flags if f)
    if active_flags > 1:
        print("ERROR: solo se puede usar un --apply-* por ejecución.")
        print("  Paso 1: --apply-auto")
        print("  Paso 2: --apply-work-reports")
        print("  Paso 3: --apply-last-resort")
        sys.exit(1)

    # Determinar modo
    dry_run = not (args.apply_auto or args.apply_work_reports or args.apply_last_resort)

    database_url = args.database_url or os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL no definido. Usa --database-url o variable de entorno.")
        sys.exit(1)

    engine = create_engine(database_url, echo=False)

    # Describir qué hace esta ejecución
    if dry_run:
        mode_label = "DRY RUN — auditoría completa, sin escribir"
    elif args.apply_auto:
        mode_label = "PASO 1 — aplicando Categoría 1 (auto) en usuarios"
    elif args.apply_work_reports:
        mode_label = "PASO 2 — aplicando backfill en partes de obra"
    else:
        mode_label = "PASO 3 — aplicando Categoría 4 (last_resort) en usuarios"

    print("=" * 70)
    print("FASE 2C — Backfill creator_group_id")
    print(f"Modo: {mode_label}")
    print(f"Fecha: {datetime.utcnow().isoformat()}")
    print("=" * 70)

    with Session(engine) as session:

        # ----------------------------------------------------------------
        # SECCIÓN USUARIOS
        # En dry_run: siempre auditar y mostrar clasificación completa.
        # En --apply-auto: aplicar Categoría 1; los WR solo se auditan.
        # En --apply-last-resort: aplicar Categoría 4; los WR solo se auditan.
        # En --apply-work-reports: usuarios solo se auditan (dry_run=True).
        # ----------------------------------------------------------------
        users_dry_run = dry_run or args.apply_work_reports

        print("\n[USUARIOS] Clasificando usuarios legacy...")
        user_report = run_users_backfill(
            session,
            dry_run=users_dry_run,
            apply_auto=args.apply_auto,
            apply_last_resort=args.apply_last_resort,
            verbose=args.verbose,
        )

        print(f"\n  Total usuarios legacy (creator_group_id IS NULL): {user_report['total_legacy']}")
        print(f"  Categoría 1 — Auto (seguro):       {len(user_report[CATEGORY_AUTO])}")
        print(f"  Categoría 2 — Semi-auto (revisar): {len(user_report[CATEGORY_SEMI_AUTO])}")
        print(f"  Categoría 3 — Manual:              {len(user_report[CATEGORY_MANUAL])}")
        print(f"  Categoría 4 — Last resort:         {len(user_report[CATEGORY_LAST_RESORT])}")

        if not users_dry_run:
            print(f"\n  -> Aplicados auto:         {user_report['applied_auto']}")
            print(f"  -> Aplicados last_resort:  {user_report['applied_last_resort']}")

        if user_report["errors"]:
            print(f"\n  ERRORES ({len(user_report['errors'])}):")
            for err in user_report["errors"]:
                print(f"    user_id={err['user_id']}: {err['error']}")

        if user_report[CATEGORY_SEMI_AUTO]:
            print(f"\n  [SEMI-AUTO — requieren revisión manual antes de aplicar]:")
            for u in user_report[CATEGORY_SEMI_AUTO]:
                print(f"    user_id={u['user_id']} ({u['email']}) — {u['reason']}")

        if user_report[CATEGORY_MANUAL]:
            print(f"\n  [MANUAL — no se aplican automáticamente, documentar decisión]:")
            for u in user_report[CATEGORY_MANUAL]:
                print(f"    user_id={u['user_id']} ({u['email']}) — {u['reason']}")

        if user_report[CATEGORY_LAST_RESORT] and (dry_run or args.apply_work_reports):
            print(f"\n  [LAST RESORT — revisar cada caso antes de ejecutar --apply-last-resort]:")
            for u in user_report[CATEGORY_LAST_RESORT]:
                print(f"    user_id={u['user_id']} ({u['email']}) — {u['reason']}")

        # ----------------------------------------------------------------
        # SECCIÓN PARTES DE OBRA
        # En dry_run: auditar siempre.
        # En --apply-work-reports: aplicar.
        # En --apply-auto o --apply-last-resort: solo auditar (dry_run=True).
        # ----------------------------------------------------------------
        wr_dry_run = dry_run or args.apply_auto or args.apply_last_resort

        print("\n[WORK REPORTS] Auditando partes legacy...")
        wr_report = run_work_reports_backfill(
            session,
            dry_run=wr_dry_run,
            verbose=args.verbose,
        )

        print(f"\n  Total partes legacy (creator_group_id IS NULL): {wr_report['total_pending']}")
        wr_label = "resolvibles" if wr_dry_run else "resueltos"
        print(f"  {wr_label.capitalize()} (backfill seguro):     {wr_report['resolved']}")
        print(f"  Irresolubles (super_admin/FK rota/sin creador): {len(wr_report['unresolved'])}")

        if wr_report["unresolved"]:
            print(f"\n  [IRRESOLUBLES — quedarán con NULL; visibles solo para super_admin en Fase 2d]:")
            for u in wr_report["unresolved"]:
                print(f"    report_id={u['report_id']} (tenant={u['tenant_id']}) — {u['reason']}")

        if wr_report["errors"]:
            print(f"\n  ERRORES ({len(wr_report['errors'])}):")
            for err in wr_report["errors"]:
                print(f"    report_id={err['report_id']}: {err['error']}")

        # ----------------------------------------------------------------
        # RESUMEN Y SIGUIENTES PASOS
        # ----------------------------------------------------------------
        print("\n" + "=" * 70)
        print("RESUMEN")
        print("=" * 70)

        if dry_run:
            cat1 = len(user_report[CATEGORY_AUTO])
            cat4 = len(user_report[CATEGORY_LAST_RESORT])
            cat2 = len(user_report[CATEGORY_SEMI_AUTO])
            cat3 = len(user_report[CATEGORY_MANUAL])
            wr_resolvable = wr_report["resolved"]
            wr_irresoluble = len(wr_report["unresolved"])
            print(f"  Usuarios: {cat1} auto + {cat4} last_resort + {cat2} semi_auto + {cat3} manual")
            print(f"  Partes:   {wr_resolvable} resolvibles + {wr_irresoluble} irresolubles")
            print(f"\n  PASOS SIGUIENTES:")
            print(f"    Paso 1 -> python -m scripts.backfill_creator_groups --apply-auto [-v]")
            print(f"    Paso 2 -> python -m scripts.backfill_creator_groups --apply-work-reports [-v]")
            if cat4:
                print(f"    Paso 3 -> python -m scripts.backfill_creator_groups --apply-last-resort [-v]")
                print(f"             (revisar antes los {cat4} casos last_resort listados arriba)")
            else:
                print(f"    Paso 3 -> no necesario (0 casos last_resort)")

        elif args.apply_auto:
            pending = len(user_report[CATEGORY_SEMI_AUTO]) + len(user_report[CATEGORY_MANUAL]) + len(user_report[CATEGORY_LAST_RESORT])
            errors = len(user_report["errors"])
            print(f"  Aplicados auto: {user_report['applied_auto']} / {len(user_report[CATEGORY_AUTO])}")
            print(f"  Errores: {errors}")
            print(f"  Pendientes tras este paso: {pending} (semi_auto + manual + last_resort)")
            if errors == 0:
                print(f"\n  [OK] Paso 1 completado. Siguiente:")
                print(f"    python -m scripts.backfill_creator_groups --apply-work-reports [-v]")
            else:
                print(f"\n  [ERROR] Hay errores — revisar antes de continuar.")

        elif args.apply_work_reports:
            errors = len(wr_report["errors"])
            print(f"  Resueltos: {wr_report['resolved']} / {wr_report['total_pending']}")
            print(f"  Irresolubles: {len(wr_report['unresolved'])}")
            print(f"  Errores: {errors}")
            lr_count = len(user_report[CATEGORY_LAST_RESORT])
            if errors == 0:
                print(f"\n  [OK] Paso 2 completado.")
                if lr_count:
                    print(f"  Siguiente (si necesario):")
                    print(f"    python -m scripts.backfill_creator_groups --dry-run -v  -> revisar last_resort")
                    print(f"    python -m scripts.backfill_creator_groups --apply-last-resort [-v]")
                else:
                    print(f"  No hay casos last_resort — Fase 2c completada salvo revisión de manuales.")
            else:
                print(f"\n  [ERROR] Hay errores — revisar antes de continuar.")

        else:  # apply_last_resort
            errors = len(user_report["errors"])
            print(f"  Aplicados last_resort: {user_report['applied_last_resort']} / {len(user_report[CATEGORY_LAST_RESORT])}")
            print(f"  Errores: {errors}")
            pending_manual = len(user_report[CATEGORY_MANUAL]) + len(user_report[CATEGORY_SEMI_AUTO])
            if errors == 0:
                print(f"\n  [OK] Paso 3 completado.")
                if pending_manual:
                    print(f"  Quedan {pending_manual} casos semi_auto/manual — documentar decisión antes de Fase 2d.")
                else:
                    print(f"  Verificar Q5/Q6 y documentar irresolubles para cerrar Fase 2c.")
            else:
                print(f"\n  [ERROR] Hay errores — revisar antes de dar Fase 2c por cerrada.")

        print(f"\n  Consultas Q5/Q6:          python -m scripts.backfill_creator_groups --show-queries")
        print(f"  Criterios de cierre:      python -m scripts.backfill_creator_groups --show-closure-criteria")
        print()


if __name__ == "__main__":
    main()
