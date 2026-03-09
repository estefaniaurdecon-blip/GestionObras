from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class CustomHolidayRead(BaseModel):
    id: int
    tenant_id: int
    date: date
    name: str
    region: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class CustomHolidayCreate(BaseModel):
    date: date
    name: str = Field(min_length=1, max_length=255)
    region: Optional[str] = Field(default=None, max_length=255)


class CustomHolidayUpdate(BaseModel):
    date: Optional[date] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    region: Optional[str] = Field(default=None, max_length=255)
