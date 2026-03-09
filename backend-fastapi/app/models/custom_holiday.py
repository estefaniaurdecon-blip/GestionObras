from __future__ import annotations

from datetime import date as DateType
from datetime import datetime
from typing import Optional

from sqlmodel import Field, Index, SQLModel


class CustomHoliday(SQLModel, table=True):
    __tablename__ = "custom_holiday"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    date: DateType = Field(index=True)
    name: str = Field(max_length=255)
    region: Optional[str] = Field(default=None, max_length=255)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_custom_holiday_tenant_date", "tenant_id", "date"),
    )
