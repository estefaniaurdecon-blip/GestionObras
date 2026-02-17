from math import ceil
from typing import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings


# Engine global para SQLModel / SQLAlchemy.
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
)


def init_db() -> None:
    """
    Crea todas las tablas definidas en los modelos SQLModel.

    Nota: en un entorno real se recomienda usar Alembic para migraciones,
    pero esto permite levantar el entorno local rápidamente.
    """

    from app.db import base  # noqa: F401  Import para registrar modelos

    SQLModel.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "erp_task" in table_names:
        task_columns = {col["name"] for col in inspector.get_columns("erp_task")}
        with engine.begin() as conn:
            if "tenant_id" not in task_columns:
                conn.execute(
                    text("ALTER TABLE erp_task ADD COLUMN tenant_id INTEGER NULL")
                )
            if "status" not in task_columns:
                # Backfill rapido para entornos locales sin migraciones.
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE erp_task "
                        "SET status = CASE WHEN is_completed THEN 'done' ELSE 'pending' END "
                        "WHERE status IS NULL"
                    )
                )
            if "start_date" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN start_date TIMESTAMP NULL"
                    )
                )
            if "end_date" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN end_date TIMESTAMP NULL"
                    )
                )
            if "subactivity_id" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN subactivity_id INTEGER NULL"
                    )
                )
            if "task_template_id" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN task_template_id INTEGER NULL"
                    )
                )

    if "erp_project" in table_names:
        project_columns = {col["name"] for col in inspector.get_columns("erp_project")}
        with engine.begin() as conn:
            if "tenant_id" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN tenant_id INTEGER NULL")
                )
            if "project_type" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN project_type VARCHAR(32) NULL")
                )
            if "department_id" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN department_id INTEGER NULL")
                )
            if "subsidy_percent" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN subsidy_percent NUMERIC(5,2) NULL")
                )
            if "loan_percent" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN loan_percent NUMERIC(5,2) NULL")
                )
            if "start_date" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN start_date TIMESTAMP NULL"
                    )
                )
            if "end_date" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN end_date TIMESTAMP NULL"
                    )
                )
            if "duration_months" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN duration_months INTEGER NULL"
                    )
                )

    if "erp_project_document" in table_names:
        doc_columns = {col["name"] for col in inspector.get_columns("erp_project_document")}
        with engine.begin() as conn:
            if "doc_type" not in doc_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project_document "
                        "ADD COLUMN doc_type VARCHAR(40) NOT NULL DEFAULT 'otros'"
                    )
                )

    # Columns auxiliares para asignaciones y tracking en actividades/subactividades.
    if "erp_activity" in table_names:
        activity_columns = {col["name"] for col in inspector.get_columns("erp_activity")}
        with engine.begin() as conn:
            if "tenant_id" not in activity_columns:
                conn.execute(
                  text("ALTER TABLE erp_activity ADD COLUMN tenant_id INTEGER NULL")
                )
            if "assigned_to_id" not in activity_columns:
                conn.execute(
                  text("ALTER TABLE erp_activity ADD COLUMN assigned_to_id INTEGER NULL")
                )

    if "erp_subactivity" in table_names:
        sub_columns = {col["name"] for col in inspector.get_columns("erp_subactivity")}
        with engine.begin() as conn:
            if "tenant_id" not in sub_columns:
                conn.execute(
                  text("ALTER TABLE erp_subactivity ADD COLUMN tenant_id INTEGER NULL")
                )
            if "assigned_to_id" not in sub_columns:
                conn.execute(
                  text("ALTER TABLE erp_subactivity ADD COLUMN assigned_to_id INTEGER NULL")
                )

    if "erp_timesession" in table_names:
        ts_columns = {col["name"] for col in inspector.get_columns("erp_timesession")}
        with engine.begin() as conn:
            if "tenant_id" not in ts_columns:
                conn.execute(
                    text("ALTER TABLE erp_timesession ADD COLUMN tenant_id INTEGER NULL")
                )
            if "activity_id" not in ts_columns:
                conn.execute(
                    text("ALTER TABLE erp_timesession ADD COLUMN activity_id INTEGER NULL")
                )
            if "subactivity_id" not in ts_columns:
                conn.execute(
                    text("ALTER TABLE erp_timesession ADD COLUMN subactivity_id INTEGER NULL")
                )

    if "erp_timeentry" in table_names:
        te_columns = {col["name"] for col in inspector.get_columns("erp_timeentry")}
        with engine.begin() as conn:
            if "tenant_id" not in te_columns:
                conn.execute(
                    text("ALTER TABLE erp_timeentry ADD COLUMN tenant_id INTEGER NULL")
                )
            if "activity_id" not in te_columns:
                conn.execute(
                    text("ALTER TABLE erp_timeentry ADD COLUMN activity_id INTEGER NULL")
                )
            if "subactivity_id" not in te_columns:
                conn.execute(
                    text("ALTER TABLE erp_timeentry ADD COLUMN subactivity_id INTEGER NULL")
                )
            if "task_id" in te_columns:
                # Asegura que la columna acepte NULL para entradas no ligadas a tareas.
                conn.execute(
                    text("ALTER TABLE erp_timeentry ALTER COLUMN task_id DROP NOT NULL")
                )

    if "erp_task_template" in table_names:
        tmpl_columns = {col["name"] for col in inspector.get_columns("erp_task_template")}
        with engine.begin() as conn:
            if "tenant_id" not in tmpl_columns:
                conn.execute(
                    text("ALTER TABLE erp_task_template ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_milestone" in table_names:
        milestone_columns = {col["name"] for col in inspector.get_columns("erp_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in milestone_columns:
                conn.execute(
                    text("ALTER TABLE erp_milestone ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_deliverable" in table_names:
        deliverable_columns = {col["name"] for col in inspector.get_columns("erp_deliverable")}
        with engine.begin() as conn:
            if "tenant_id" not in deliverable_columns:
                conn.execute(
                    text("ALTER TABLE erp_deliverable ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_project_budget_line" in table_names:
        budget_line_columns = {col["name"] for col in inspector.get_columns("erp_project_budget_line")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_line_columns:
                conn.execute(
                    text("ALTER TABLE erp_project_budget_line ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_project_budget_milestone" in table_names:
        budget_milestone_columns = {col["name"] for col in inspector.get_columns("erp_project_budget_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_milestone_columns:
                conn.execute(
                    text("ALTER TABLE erp_project_budget_milestone ADD COLUMN tenant_id INTEGER NULL")
                )
            # Backfill tenant_id from project if missing.
            conn.execute(
                text(
                    "UPDATE erp_project_budget_milestone m "
                    "SET tenant_id = p.tenant_id "
                    "FROM erp_project p "
                    "WHERE m.project_id = p.id AND m.tenant_id IS NULL"
                )
            )

    if "erp_budget_line_milestone" in table_names:
        budget_link_columns = {col["name"] for col in inspector.get_columns("erp_budget_line_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_link_columns:
                conn.execute(
                    text("ALTER TABLE erp_budget_line_milestone ADD COLUMN tenant_id INTEGER NULL")
                )
            # Backfill tenant_id from project through budget line if missing.
            conn.execute(
                text(
                    "UPDATE erp_budget_line_milestone blm "
                    "SET tenant_id = p.tenant_id "
                    "FROM erp_project_budget_line bl "
                    "JOIN erp_project p ON p.id = bl.project_id "
                    "WHERE blm.budget_line_id = bl.id AND blm.tenant_id IS NULL"
                )
            )

    if "erp_external_collaboration" in table_names:
        collab_columns = {col["name"] for col in inspector.get_columns("erp_external_collaboration")}
        with engine.begin() as conn:
            if "tenant_id" not in collab_columns:
                conn.execute(
                    text("ALTER TABLE erp_external_collaboration ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_simulation_project" in table_names:
        sim_columns = {col["name"] for col in inspector.get_columns("erp_simulation_project")}
        with engine.begin() as conn:
            if "threshold_percent" not in sim_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_simulation_project "
                        "ADD COLUMN threshold_percent DECIMAL NULL"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE erp_simulation_project "
                        "SET threshold_percent = 50 "
                        "WHERE threshold_percent IS NULL"
                    )
                )

    if "erp_project" in table_names:
        project_columns = {col["name"] for col in inspector.get_columns("erp_project")}
        with engine.begin() as conn:
            if "project_type" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN project_type VARCHAR(32) NULL")
                )

        from sqlmodel import select
        from app.models.erp import Project

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

    if "department" in table_names:
        dept_columns = {col["name"] for col in inspector.get_columns("department")}
        with engine.begin() as conn:
            if "project_allocation_percentage" not in dept_columns:
                conn.execute(
                    text(
                        "ALTER TABLE department "
                        "ADD COLUMN project_allocation_percentage DECIMAL NULL"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE department "
                        "SET project_allocation_percentage = 100 "
                        "WHERE project_allocation_percentage IS NULL"
                    )
                )

    if "invoice" in table_names:
        invoice_columns = {col["name"] for col in inspector.get_columns("invoice")}
        with engine.begin() as conn:
            if "subsidizable" not in invoice_columns:
                conn.execute(
                    text("ALTER TABLE invoice ADD COLUMN subsidizable BOOLEAN NULL")
                )
            if "expense_type" not in invoice_columns:
                conn.execute(
                    text("ALTER TABLE invoice ADD COLUMN expense_type VARCHAR(128) NULL")
                )
            if "milestone_id" not in invoice_columns:
                conn.execute(
                    text("ALTER TABLE invoice ADD COLUMN milestone_id INTEGER NULL")
                )
            if "budget_milestone_id" not in invoice_columns:
                conn.execute(
                    text(
                        "ALTER TABLE invoice "
                        "ADD COLUMN budget_milestone_id INTEGER NULL"
                    )
                )

    if "notification_log" in table_names:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'CREATED'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_20'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_10'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_5'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_1'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_DAILY'")
            )

    if "audit_log" in table_names or "auditlog" in table_names:
        audit_table = "audit_log" if "audit_log" in table_names else "auditlog"
        audit_columns = {col["name"] for col in inspector.get_columns(audit_table)}
        with engine.begin() as conn:
            if "source" not in audit_columns:
                conn.execute(
                    text(f"ALTER TABLE {audit_table} ADD COLUMN source VARCHAR(16) NULL")
                )
                conn.execute(
                    text(f"UPDATE {audit_table} SET source = 'app' WHERE source IS NULL")
                )

    if "user" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("user")}
        with engine.begin() as conn:
            if "avatar_url" not in user_columns:
                conn.execute(
                    text('ALTER TABLE "user" ADD COLUMN avatar_url VARCHAR(512) NULL')
                )
            if "avatar_data" not in user_columns:
                conn.execute(
                    text('ALTER TABLE "user" ADD COLUMN avatar_data TEXT NULL')
                )

    if "users" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "avatar_url" not in user_columns:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL")
                )
            if "avatar_data" not in user_columns:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN avatar_data TEXT NULL")
                )

    if "tenant_branding" in table_names:
        branding_columns = {
            col["name"] for col in inspector.get_columns("tenant_branding")
        }
        with engine.begin() as conn:
            if "company_name" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN company_name VARCHAR(128) NULL"
                    )
                )
            if "company_subtitle" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN company_subtitle VARCHAR(256) NULL"
                    )
                )
            if "show_company_name" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN show_company_name BOOLEAN NOT NULL DEFAULT TRUE"
                    )
                )
            if "show_company_subtitle" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN show_company_subtitle BOOLEAN NOT NULL DEFAULT TRUE"
                    )
                )
            if "department_emails" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN department_emails JSON NULL"
                    )
                )

    # Campos de disponibilidad en perfiles de empleado.
    if "employeeprofile" in table_names:
        emp_columns = {col["name"] for col in inspector.get_columns("employeeprofile")}
        with engine.begin() as conn:
            if "available_hours" not in emp_columns:
                conn.execute(
                    text("ALTER TABLE employeeprofile ADD COLUMN available_hours DECIMAL NULL")
                )
            if "availability_percentage" not in emp_columns:
                conn.execute(
                    text(
                        "ALTER TABLE employeeprofile ADD COLUMN availability_percentage DECIMAL NULL"
                    )
                )
            if "titulacion" not in emp_columns:
                conn.execute(
                    text("ALTER TABLE employeeprofile ADD COLUMN titulacion VARCHAR(255) NULL")
                )

    # Migración sencilla a hitos dinámicos: si no hay hitos de presupuesto creados,
    # creamos dos por proyecto y volcamos los valores existentes de hito1/hito2.
    if "erp_project_budget_milestone" in table_names and "erp_project_budget_line" in table_names:
        from sqlmodel import select
        from app.models.erp import ProjectBudgetMilestone, ProjectBudgetLine, BudgetLineMilestone, Project

        with Session(engine) as session:
            existing = session.exec(select(ProjectBudgetMilestone)).first()
            if not existing:
                projects = session.exec(select(Project)).all()
                # crea dos hitos por proyecto
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

def get_session() -> Iterator[Session]:
    """
    Proveedor de sesiones de base de datos para FastAPI.

    FastAPI reconoce esta función generadora y se encarga
    de abrir y cerrar la sesión alrededor de cada petición.
    """

    with Session(engine) as session:
        yield session
