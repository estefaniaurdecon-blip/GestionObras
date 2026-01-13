from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class ProjectRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True


class TaskRead(BaseModel):
    id: int
    project_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str
    is_completed: bool
    created_at: datetime


class TaskCreate(BaseModel):
    project_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    is_completed: bool = False


class TaskUpdate(BaseModel):
    project_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    is_completed: Optional[bool] = None


class TimeSessionRead(BaseModel):
    id: int
    task_id: int
    user_id: int
    description: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int
    is_active: bool
    created_at: datetime


class TimeTrackingStart(BaseModel):
    task_id: int


class TimeSessionCreate(BaseModel):
    task_id: int
    description: Optional[str] = None
    started_at: datetime
    ended_at: datetime


class TimeSessionUpdate(BaseModel):
    task_id: Optional[int] = None
    description: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class TimeReportRow(BaseModel):
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    task_id: int
    task_title: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    total_hours: Decimal
    hourly_rate: Optional[Decimal] = None
