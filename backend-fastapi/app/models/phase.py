from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Optional

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class Phase(SQLModel, table=True):
    __tablename__ = "erp_phase"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id", index=True)
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None)
    responsible: Optional[str] = Field(default=None, max_length=255)
    start_date: DateType = Field(index=True)
    end_date: DateType = Field(index=True)
    status: str = Field(default="pending", max_length=32, index=True)
    progress: int = Field(default=0)

    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_erp_phase_tenant_project", "tenant_id", "project_id"),
        Index("ix_erp_phase_tenant_dates", "tenant_id", "start_date", "end_date"),
    )
