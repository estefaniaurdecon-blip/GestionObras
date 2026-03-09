from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


PhaseStatus = Literal["pending", "in_progress", "completed"]


class PhaseRead(BaseModel):
    id: int
    tenant_id: int
    project_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    responsible: Optional[str] = None
    start_date: date
    end_date: date
    status: PhaseStatus
    progress: int
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    work_name: Optional[str] = None


class PhaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    project_id: Optional[int] = None
    description: Optional[str] = None
    responsible: Optional[str] = Field(default=None, max_length=255)
    start_date: date
    end_date: date
    status: PhaseStatus = "pending"
    progress: int = Field(default=0, ge=0, le=100)


class PhaseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    project_id: Optional[int] = None
    description: Optional[str] = None
    responsible: Optional[str] = Field(default=None, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[PhaseStatus] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)

