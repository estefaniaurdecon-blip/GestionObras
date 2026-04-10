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
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'"
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

    if "erp_rental_machinery" in table_names:
        rental_columns = {col["name"] for col in inspector.get_columns("erp_rental_machinery")}
        with engine.begin() as conn:
            if "machine_number" not in rental_columns:
                conn.execute(
                    text("ALTER TABLE erp_rental_machinery ADD COLUMN machine_number VARCHAR(128) NULL")
                )
            if "notes" not in rental_columns:
                conn.execute(
                    text("ALTER TABLE erp_rental_machinery ADD COLUMN notes TEXT NULL")
                )
            if "image_url" not in rental_columns:
                conn.execute(
                    text("ALTER TABLE erp_rental_machinery ADD COLUMN image_url TEXT NULL")
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

    if "erp_budget_line_milestone" in table_names:
        budget_link_columns = {col["name"] for col in inspector.get_columns("erp_budget_line_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_link_columns:
                conn.execute(
                    text("ALTER TABLE erp_budget_line_milestone ADD COLUMN tenant_id INTEGER NULL")
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

    if engine.dialect.name == "postgresql" and "notification_log" in table_names:
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

    if engine.dialect.name == "postgresql" and "notification" in table_names:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'work_report_approved'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'work_report_pending'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'work_assigned'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'machinery_expiry_warning'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'new_message'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ticket_assigned'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ticket_comment'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ticket_status'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'generic'")
            )

    if "audit_log" in table_names or "auditlog" in table_names:
        audit_table = "audit_log" if "audit_log" in table_names else "auditlog"
        audit_columns = {col["name"] for col in inspector.get_columns(audit_table)}
        with engine.begin() as conn:
            if "source" not in audit_columns:
                conn.execute(
                    text(f"ALTER TABLE {audit_table} ADD COLUMN source VARCHAR(16) NULL")
                )

    if "user" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("user")}
        with engine.begin() as conn:
            if "created_by_user_id" not in user_columns:
                conn.execute(
                    text('ALTER TABLE "user" ADD COLUMN created_by_user_id INTEGER NULL')
                )
            if "creator_group_id" not in user_columns:
                conn.execute(
                    text('ALTER TABLE "user" ADD COLUMN creator_group_id INTEGER NULL')
                )
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
            if "created_by_user_id" not in user_columns:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN created_by_user_id INTEGER NULL")
                )
            if "creator_group_id" not in user_columns:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN creator_group_id INTEGER NULL")
                )
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

def get_session() -> Iterator[Session]:
    """
    Proveedor de sesiones de base de datos para FastAPI.

    FastAPI reconoce esta función generadora y se encarga
    de abrir y cerrar la sesión alrededor de cada petición.
    """

    with Session(engine) as session:
        yield session
