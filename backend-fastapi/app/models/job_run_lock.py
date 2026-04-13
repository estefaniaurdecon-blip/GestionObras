from __future__ import annotations

from datetime import date, datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class JobRunLock(SQLModel, table=True):
    """
    Lock idempotente por tenant/job/fecha para evitar ejecuciones duplicadas.
    """

    __tablename__ = "job_run_lock"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    job_name: str = Field(max_length=128, index=True)
    run_date: date = Field(index=True)
    status: str = Field(default="completed", max_length=32, index=True)
    detail: Optional[str] = Field(default=None, max_length=512)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    completed_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index(
            "ix_job_run_lock_tenant_job_date_unique",
            "tenant_id",
            "job_name",
            "run_date",
            unique=True,
        ),
    )
