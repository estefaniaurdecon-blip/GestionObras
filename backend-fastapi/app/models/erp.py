from __future__ import annotations

from datetime import date as DateType, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, Index, JSON, Numeric, Text
from sqlmodel import Field, SQLModel


class Project(SQLModel, table=True):
    __tablename__ = "erp_project"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    department_id: Optional[int] = Field(default=None, foreign_key="department.id")
    name: str
    description: Optional[str] = None
    project_type: Optional[str] = Field(default=None, max_length=32)
    department_id: Optional[int] = Field(default=None, foreign_key="department.id")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    duration_months: Optional[int] = None
    loan_percent: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2)))
    subsidy_percent: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2)))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Task(SQLModel, table=True):
    __tablename__ = "erp_task"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id")
    # Subactividad dentro del proyecto (opcional para compatibilidad).
    subactivity_id: Optional[int] = Field(default=None, foreign_key="erp_subactivity.id")
    # Plantilla base de tarea (catalogo reusable).
    task_template_id: Optional[int] = Field(default=None, foreign_key="erp_task_template.id")
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str = Field(default="pending", max_length=20)
    is_completed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TaskTemplate(SQLModel, table=True):
    __tablename__ = "erp_task_template"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    title: str
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Activity(SQLModel, table=True):
    __tablename__ = "erp_activity"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SubActivity(SQLModel, table=True):
    __tablename__ = "erp_subactivity"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    activity_id: int = Field(foreign_key="erp_activity.id")
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Milestone(SQLModel, table=True):
    __tablename__ = "erp_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    # Hito opcionalmente ligado a una actividad concreta.
    activity_id: Optional[int] = Field(default=None, foreign_key="erp_activity.id")
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Deliverable(SQLModel, table=True):
    __tablename__ = "erp_deliverable"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    milestone_id: int = Field(foreign_key="erp_milestone.id")
    title: str
    notes: Optional[str] = None
    # Registro inicial de entregable (texto/URL).
    link_url: Optional[str] = None
    # Preparado para futura subida de archivos (referencia externa).
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    is_late: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TimeEntry(SQLModel, table=True):
    __tablename__ = "erp_timeentry"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    task_id: Optional[int] = Field(default=None, foreign_key="erp_task.id")
    activity_id: Optional[int] = Field(default=None, foreign_key="erp_activity.id")
    subactivity_id: Optional[int] = Field(default=None, foreign_key="erp_subactivity.id")
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    time_session_id: Optional[int] = Field(default=None, foreign_key="erp_timesession.id")
    hours: Decimal = Field(sa_column=Column(Numeric(6, 2)))
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TimeSession(SQLModel, table=True):
    __tablename__ = "erp_timesession"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    task_id: Optional[int] = Field(default=None, foreign_key="erp_task.id")
    activity_id: Optional[int] = Field(default=None, foreign_key="erp_activity.id")
    subactivity_id: Optional[int] = Field(default=None, foreign_key="erp_subactivity.id")
    user_id: int = Field(foreign_key="user.id")
    description: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectBudgetLine(SQLModel, table=True):
    __tablename__ = "erp_project_budget_line"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    concept: str
    hito1_budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified_hito1: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    hito2_budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified_hito2: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    approved_budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    percent_spent: Decimal = Field(sa_column=Column(Numeric(6, 2), nullable=False))
    forecasted_spent: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectBudgetMilestone(SQLModel, table=True):
    __tablename__ = "erp_project_budget_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    name: str
    order_index: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BudgetLineMilestone(SQLModel, table=True):
    __tablename__ = "erp_budget_line_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    budget_line_id: int = Field(foreign_key="erp_project_budget_line.id")
    milestone_id: int = Field(foreign_key="erp_project_budget_milestone.id")
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExternalCollaboration(SQLModel, table=True):
    __tablename__ = "erp_external_collaboration"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    collaboration_type: str
    name: str
    legal_name: str
    cif: str
    contact_email: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SimulationProject(SQLModel, table=True):
    __tablename__ = "erp_simulation_project"

    # Proyecto de simulacion por tenant.
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    name: str
    budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False), default=0)
    subsidy_percent: Decimal = Field(
        sa_column=Column(Numeric(6, 2), nullable=False),
        default=0,
    )
    threshold_percent: Decimal = Field(
        sa_column=Column(Numeric(6, 2), nullable=False),
        default=50,
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SimulationExpense(SQLModel, table=True):
    __tablename__ = "erp_simulation_expense"

    # Gasto asociado a un proyecto de simulacion.
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="erp_simulation_project.id")
    concept: str
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False), default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectDocument(SQLModel, table=True):
    __tablename__ = "erp_project_document"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    doc_type: str = Field(default="otros", max_length=40)
    file_name: str
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class WorkReport(SQLModel, table=True):
    __tablename__ = "erp_work_report"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)

    external_id: Optional[str] = Field(default=None, max_length=128, index=True)
    report_identifier: Optional[str] = Field(default=None, max_length=64, index=True)
    idempotency_key: Optional[str] = Field(default=None, max_length=128, index=True)

    title: Optional[str] = Field(default=None, max_length=255)
    date: DateType = Field(index=True)
    status: str = Field(default="draft", max_length=32, index=True)
    is_closed: bool = Field(default=False, index=True)

    payload: dict = Field(
        default_factory=dict,
        sa_column=Column("payload_json", JSON, nullable=False, default=dict),
    )

    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_erp_work_report_tenant_date", "tenant_id", "date"),
        Index("ix_erp_work_report_tenant_updated", "tenant_id", "updated_at"),
        Index("ix_erp_work_report_tenant_external", "tenant_id", "external_id", unique=True),
        Index("ix_erp_work_report_tenant_idem", "tenant_id", "idempotency_key", unique=True),
    )


class AccessControlReport(SQLModel, table=True):
    __tablename__ = "erp_access_control_report"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id", index=True)
    external_id: Optional[str] = Field(default=None, max_length=128, index=True)

    date: DateType = Field(index=True)
    site_name: str = Field(max_length=255)
    responsible: str = Field(max_length=255)
    responsible_entry_time: Optional[str] = Field(default=None, max_length=8)
    responsible_exit_time: Optional[str] = Field(default=None, max_length=8)
    observations: str = Field(default="")
    personal_entries: list = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
    )
    machinery_entries: list = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
    )
    additional_tasks: Optional[str] = Field(default=None)

    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_erp_access_control_tenant_date", "tenant_id", "date"),
        Index("ix_erp_access_control_tenant_updated", "tenant_id", "updated_at"),
        Index("ix_erp_access_control_tenant_external", "tenant_id", "external_id", unique=True),
    )


class WorkReportSyncLog(SQLModel, table=True):
    __tablename__ = "erp_work_report_sync_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    client_op_id: str = Field(max_length=128, index=True)
    op: str = Field(max_length=16)
    status: str = Field(default="ok", max_length=16, index=True)

    server_report_id: Optional[int] = Field(default=None, foreign_key="erp_work_report.id", index=True)
    external_id: Optional[str] = Field(default=None, max_length=128, index=True)
    error: Optional[str] = Field(default=None, max_length=512)
    response_payload: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
    )
    processed_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_erp_work_report_sync_tenant_op", "tenant_id", "client_op_id", unique=True),
    )


class RentalMachinery(SQLModel, table=True):
    __tablename__ = "erp_rental_machinery"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)

    is_rental: bool = Field(default=True, index=True)
    name: str = Field(max_length=255)
    machine_number: Optional[str] = Field(default=None, max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    provider: Optional[str] = Field(default=None, max_length=255)
    start_date: DateType = Field(index=True)
    end_date: Optional[DateType] = Field(default=None, index=True)
    price: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    price_unit: str = Field(default="day", max_length=16)
    status: str = Field(default="active", max_length=16, index=True)

    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_erp_rental_tenant_project_dates", "tenant_id", "project_id", "start_date"),
        Index("ix_erp_rental_tenant_status", "tenant_id", "status"),
    )


class WorkRepaso(SQLModel, table=True):
    __tablename__ = "erp_work_repaso"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)

    external_id: Optional[str] = Field(default=None, max_length=128, index=True)
    code: str = Field(max_length=64, index=True)
    status: str = Field(default="pending", max_length=32, index=True)
    description: str = Field(sa_column=Column(Text, nullable=False))
    assigned_company: Optional[str] = Field(default=None, max_length=255)
    estimated_hours: Decimal = Field(default=0, sa_column=Column(Numeric(10, 2), nullable=False))
    actual_hours: Decimal = Field(default=0, sa_column=Column(Numeric(10, 2), nullable=False))
    before_image: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    after_image: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    subcontract_groups: Any = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))

    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_erp_work_repaso_tenant_project_updated", "tenant_id", "project_id", "updated_at"),
        Index("ix_erp_work_repaso_tenant_external", "tenant_id", "external_id", unique=True),
    )


class WorkPostventa(SQLModel, table=True):
    __tablename__ = "erp_work_postventa"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)

    external_id: Optional[str] = Field(default=None, max_length=128, index=True)
    code: str = Field(max_length=64, index=True)
    status: str = Field(default="pending", max_length=32, index=True)
    description: str = Field(sa_column=Column(Text, nullable=False))
    assigned_company: Optional[str] = Field(default=None, max_length=255)
    estimated_hours: Decimal = Field(default=0, sa_column=Column(Numeric(10, 2), nullable=False))
    actual_hours: Decimal = Field(default=0, sa_column=Column(Numeric(10, 2), nullable=False))
    before_image: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    after_image: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    subcontract_groups: Any = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))

    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    deleted_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_erp_work_postventa_tenant_project_updated", "tenant_id", "project_id", "updated_at"),
        Index("ix_erp_work_postventa_tenant_external", "tenant_id", "external_id", unique=True),
    )

