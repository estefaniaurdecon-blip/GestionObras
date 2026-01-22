from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, Numeric
from sqlmodel import Field, SQLModel


class Project(SQLModel, table=True):
    __tablename__ = "erp_project"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Task(SQLModel, table=True):
    __tablename__ = "erp_task"

    id: Optional[int] = Field(default=None, primary_key=True)
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
    title: str
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Activity(SQLModel, table=True):
    __tablename__ = "erp_activity"

    id: Optional[int] = Field(default=None, primary_key=True)
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
    project_id: int = Field(foreign_key="erp_project.id")
    name: str
    order_index: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BudgetLineMilestone(SQLModel, table=True):
    __tablename__ = "erp_budget_line_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    budget_line_id: int = Field(foreign_key="erp_project_budget_line.id")
    milestone_id: int = Field(foreign_key="erp_project_budget_milestone.id")
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)
