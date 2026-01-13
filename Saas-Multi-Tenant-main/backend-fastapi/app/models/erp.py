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
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str = Field(default="pending", max_length=20)
    is_completed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TimeEntry(SQLModel, table=True):
    __tablename__ = "erp_timeentry"

    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="erp_task.id")
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    time_session_id: Optional[int] = Field(default=None, foreign_key="erp_timesession.id")
    hours: Decimal = Field(sa_column=Column(Numeric(6, 2)))
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TimeSession(SQLModel, table=True):
    __tablename__ = "erp_timesession"

    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="erp_task.id")
    user_id: int = Field(foreign_key="user.id")
    description: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
