from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, Index, SQLModel


class WorkReportComment(SQLModel, table=True):
    __tablename__ = "erp_work_report_comment"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_report_id: str = Field(max_length=128, index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    comment: str = Field(max_length=4000)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_erp_work_report_comment_tenant_report", "tenant_id", "work_report_id"),
    )
