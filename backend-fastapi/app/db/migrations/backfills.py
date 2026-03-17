"""
One-shot backfill / seed scripts extracted from init_db() startup.

Each function is idempotent and safe to re-run.
They should be executed AFTER the schema (DDL) is already in place
(i.e. after the app has started at least once with init_db()).

Usage:
    python -m app.db.migrations.run_all
"""

from math import ceil

from sqlalchemy import inspect, text
from sqlmodel import Session

from app.db.session import engine


# ---------------------------------------------------------------------------
# Work-report identifier normalisation + unique index
# ---------------------------------------------------------------------------

def _normalize_report_identifier(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _build_unique_report_identifier(base: str, row_id: int, used: set[str]) -> str:
    suffix = f"-{row_id}"
    room = max(1, 64 - len(suffix))
    candidate_base = (base or "parte")[:room]
    candidate = f"{candidate_base}{suffix}"
    counter = 1
    while candidate in used:
        counter_suffix = f"-{row_id}-{counter}"
        room = max(1, 64 - len(counter_suffix))
        candidate_base = (base or "parte")[:room]
        candidate = f"{candidate_base}{counter_suffix}"
        counter += 1
    return candidate


def backfill_work_report_identifiers() -> None:
    """Normalize + deduplicate report_identifier, then recreate unique index."""
    from sqlmodel import select
    from app.models.erp import WorkReport

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "erp_work_report" not in table_names:
        return

    with Session(engine) as session:
        reports = session.exec(
            select(WorkReport)
            .where(WorkReport.report_identifier.is_not(None))
            .order_by(WorkReport.tenant_id.asc(), WorkReport.created_at.asc(), WorkReport.id.asc())
        ).all()

        used_identifiers: set[str] = set()
        has_changes = False

        for report in reports:
            original_identifier = report.report_identifier
            normalized_identifier = _normalize_report_identifier(original_identifier)

            final_identifier = normalized_identifier
            if final_identifier is not None and final_identifier in used_identifiers:
                final_identifier = _build_unique_report_identifier(
                    final_identifier, int(report.id or 0), used_identifiers
                )

            if final_identifier is not None:
                used_identifiers.add(final_identifier)

            if final_identifier != original_identifier:
                report.report_identifier = final_identifier
                has_changes = True

            payload = dict(report.payload or {})
            payload_identifier = _normalize_report_identifier(
                payload.get("reportIdentifier") or payload.get("report_identifier")
            )
            if final_identifier is None:
                if payload_identifier is not None:
                    payload.pop("reportIdentifier", None)
                    payload.pop("report_identifier", None)
                    report.payload = payload
                    has_changes = True
            elif payload_identifier != final_identifier:
                payload["reportIdentifier"] = final_identifier
                payload["report_identifier"] = final_identifier
                report.payload = payload
                has_changes = True

        if has_changes:
            session.commit()

    with engine.begin() as conn:
        conn.execute(
            text(
                "DROP INDEX IF EXISTS ix_erp_work_report_tenant_report_identifier_uq"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ix_erp_work_report_report_identifier_uq "
                "ON erp_work_report (report_identifier)"
            )
        )

    print("  [OK] backfill_work_report_identifiers")


# ---------------------------------------------------------------------------
# erp_task.status backfill
# ---------------------------------------------------------------------------

def backfill_task_status() -> None:
    """Set status = done/pending based on is_completed for rows with NULL status."""
    inspector = inspect(engine)
    if "erp_task" not in set(inspector.get_table_names()):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE erp_task "
                "SET status = CASE WHEN is_completed THEN 'done' ELSE 'pending' END "
                "WHERE status IS NULL"
            )
        )
    print("  [OK] backfill_task_status")


# ---------------------------------------------------------------------------
# erp_project.duration_months backfill
# ---------------------------------------------------------------------------

def backfill_project_duration_months() -> None:
    """Calculate duration_months from start_date/end_date where missing."""
    from sqlmodel import select
    from app.models.erp import Project

    inspector = inspect(engine)
    if "erp_project" not in set(inspector.get_table_names()):
        return

    with Session(engine) as session:
        projects = session.exec(select(Project)).all()
        updated = False
        for project in projects:
            if (
                project.start_date
                and project.end_date
                and project.duration_months is None
            ):
                start = project.start_date.date()
                end = project.end_date.date()
                if end >= start:
                    total_days = (end - start).days + 1
                    months = max(1, ceil(total_days / 30))
                    project.duration_months = months
                    updated = True
        if updated:
            session.commit()

    print("  [OK] backfill_project_duration_months")


# ---------------------------------------------------------------------------
# erp_project_budget_milestone.tenant_id backfill
# ---------------------------------------------------------------------------

def backfill_budget_milestone_tenant_id() -> None:
    """Copy tenant_id from erp_project into erp_project_budget_milestone."""
    inspector = inspect(engine)
    if "erp_project_budget_milestone" not in set(inspector.get_table_names()):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE erp_project_budget_milestone m "
                "SET tenant_id = p.tenant_id "
                "FROM erp_project p "
                "WHERE m.project_id = p.id AND m.tenant_id IS NULL"
            )
        )
    print("  [OK] backfill_budget_milestone_tenant_id")


# ---------------------------------------------------------------------------
# erp_budget_line_milestone.tenant_id backfill
# ---------------------------------------------------------------------------

def backfill_budget_line_milestone_tenant_id() -> None:
    """Copy tenant_id from erp_project through budget line."""
    inspector = inspect(engine)
    if "erp_budget_line_milestone" not in set(inspector.get_table_names()):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE erp_budget_line_milestone blm "
                "SET tenant_id = p.tenant_id "
                "FROM erp_project_budget_line bl "
                "JOIN erp_project p ON p.id = bl.project_id "
                "WHERE blm.budget_line_id = bl.id AND blm.tenant_id IS NULL"
            )
        )
    print("  [OK] backfill_budget_line_milestone_tenant_id")


# ---------------------------------------------------------------------------
# erp_simulation_project.threshold_percent backfill
# ---------------------------------------------------------------------------

def backfill_simulation_threshold() -> None:
    """Default threshold_percent = 50 for existing rows."""
    inspector = inspect(engine)
    if "erp_simulation_project" not in set(inspector.get_table_names()):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE erp_simulation_project "
                "SET threshold_percent = 50 "
                "WHERE threshold_percent IS NULL"
            )
        )
    print("  [OK] backfill_simulation_threshold")


# ---------------------------------------------------------------------------
# department.project_allocation_percentage backfill
# ---------------------------------------------------------------------------

def backfill_department_allocation() -> None:
    """Default project_allocation_percentage = 100 for existing rows."""
    inspector = inspect(engine)
    if "department" not in set(inspector.get_table_names()):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE department "
                "SET project_allocation_percentage = 100 "
                "WHERE project_allocation_percentage IS NULL"
            )
        )
    print("  [OK] backfill_department_allocation")


# ---------------------------------------------------------------------------
# audit_log.source backfill
# ---------------------------------------------------------------------------

def backfill_audit_log_source() -> None:
    """Default source = 'app' for existing rows."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "audit_log" not in table_names and "auditlog" not in table_names:
        return
    audit_table = "audit_log" if "audit_log" in table_names else "auditlog"
    with engine.begin() as conn:
        conn.execute(
            text(f"UPDATE {audit_table} SET source = 'app' WHERE source IS NULL")
        )
    print("  [OK] backfill_audit_log_source")


# ---------------------------------------------------------------------------
# Budget milestone seed (HITO 1/2)
# ---------------------------------------------------------------------------

def seed_budget_milestones() -> None:
    """Create HITO 1/2 per project and link budget lines (one-time seed)."""
    from sqlmodel import select
    from app.models.erp import (
        ProjectBudgetMilestone,
        ProjectBudgetLine,
        BudgetLineMilestone,
        Project,
    )

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "erp_project_budget_milestone" not in table_names:
        return
    if "erp_project_budget_line" not in table_names:
        return

    with Session(engine) as session:
        existing = session.exec(select(ProjectBudgetMilestone)).first()
        if existing:
            print("  [SKIP] seed_budget_milestones (already seeded)")
            return

        projects = session.exec(select(Project)).all()
        created_milestones: dict[tuple[int, int], ProjectBudgetMilestone] = {}
        for project in projects:
            m1 = ProjectBudgetMilestone(project_id=project.id, name="HITO 1", order_index=1)
            m2 = ProjectBudgetMilestone(project_id=project.id, name="HITO 2", order_index=2)
            session.add(m1)
            session.add(m2)
            session.commit()
            session.refresh(m1)
            session.refresh(m2)
            created_milestones[(project.id, 1)] = m1
            created_milestones[(project.id, 2)] = m2

        lines = session.exec(select(ProjectBudgetLine)).all()
        for line in lines:
            m1 = created_milestones.get((line.project_id, 1))
            m2 = created_milestones.get((line.project_id, 2))
            if m1:
                session.add(
                    BudgetLineMilestone(
                        budget_line_id=line.id,
                        milestone_id=m1.id,
                        amount=line.hito1_budget or 0,
                        justified=line.justified_hito1 or 0,
                    )
                )
            if m2:
                session.add(
                    BudgetLineMilestone(
                        budget_line_id=line.id,
                        milestone_id=m2.id,
                        amount=line.hito2_budget or 0,
                        justified=line.justified_hito2 or 0,
                    )
                )
        session.commit()

    print("  [OK] seed_budget_milestones")


# ---------------------------------------------------------------------------
# erp_project latitude/longitude columns
# ---------------------------------------------------------------------------

def add_project_geolocation_columns() -> None:
    """Add latitude and longitude columns to erp_project if not present."""
    inspector = inspect(engine)
    if "erp_project" not in set(inspector.get_table_names()):
        return
    existing_cols = {c["name"] for c in inspector.get_columns("erp_project")}
    with engine.begin() as conn:
        if "latitude" not in existing_cols:
            conn.execute(text("ALTER TABLE erp_project ADD COLUMN latitude DOUBLE PRECISION"))
        if "longitude" not in existing_cols:
            conn.execute(text("ALTER TABLE erp_project ADD COLUMN longitude DOUBLE PRECISION"))
    print("  [OK] add_project_geolocation_columns")


# ---------------------------------------------------------------------------
# Public list for run_all
# ---------------------------------------------------------------------------

ALL_BACKFILLS = [
    add_project_geolocation_columns,
    backfill_work_report_identifiers,
    backfill_task_status,
    backfill_project_duration_months,
    backfill_budget_milestone_tenant_id,
    backfill_budget_line_milestone_tenant_id,
    backfill_simulation_threshold,
    backfill_department_allocation,
    backfill_audit_log_source,
    seed_budget_milestones,
]
