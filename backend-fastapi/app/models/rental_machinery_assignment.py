from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Optional

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, SQLModel


class RentalMachineryAssignment(SQLModel, table=True):
    __tablename__ = "erp_rental_machinery_assignment"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    rental_machinery_id: str = Field(max_length=128, index=True)
    work_id: str = Field(max_length=128, index=True)
    assignment_date: DateType = Field(index=True)
    end_date: Optional[DateType] = Field(default=None, index=True)
    operator_name: str = Field(max_length=255)
    company_name: str = Field(max_length=255)
    activity: Optional[str] = Field(default=None)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_erp_rental_assignment_tenant_work_date", "tenant_id", "work_id", "assignment_date"),
        UniqueConstraint(
            "tenant_id",
            "rental_machinery_id",
            "assignment_date",
            name="uq_erp_rental_assignment_machine_date",
        ),
    )
