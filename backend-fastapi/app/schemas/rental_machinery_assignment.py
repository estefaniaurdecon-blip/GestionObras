from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class RentalMachineryAssignmentRead(BaseModel):
    id: int
    tenant_id: int
    rental_machinery_id: str
    work_id: str
    assignment_date: date
    end_date: Optional[date] = None
    operator_name: str
    company_name: str
    activity: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class RentalMachineryAssignmentCreate(BaseModel):
    rental_machinery_id: str = Field(min_length=1, max_length=128)
    work_id: str = Field(min_length=1, max_length=128)
    assignment_date: date
    end_date: Optional[date] = None
    operator_name: str = Field(min_length=1, max_length=255)
    company_name: str = Field(min_length=1, max_length=255)
    activity: Optional[str] = None


class RentalMachineryAssignmentUpdate(BaseModel):
    assignment_date: Optional[date] = None
    end_date: Optional[date] = None
    operator_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    company_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    activity: Optional[str] = None
