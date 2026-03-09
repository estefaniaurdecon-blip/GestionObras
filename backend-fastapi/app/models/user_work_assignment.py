from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class UserWorkAssignment(SQLModel, table=True):
    __tablename__ = "erp_user_work_assignment"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index(
            "ix_erp_user_work_assignment_tenant_user_project_uq",
            "tenant_id",
            "user_id",
            "project_id",
            unique=True,
        ),
    )

