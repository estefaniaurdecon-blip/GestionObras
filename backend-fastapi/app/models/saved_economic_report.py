from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Any, Optional

from sqlalchemy import Column, Index
from sqlmodel import Field, SQLModel

from app.db.types import JSONB_COMPAT


class SavedEconomicReport(SQLModel, table=True):
    __tablename__ = "saved_economic_report"

    id: Optional[int] = Field(default=None, primary_key=True)

    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_report_id: str = Field(max_length=256, index=True)
    saved_by: str = Field(max_length=128, index=True)

    work_name: str = Field(default="", max_length=512)
    work_number: str = Field(default="", max_length=128)
    date: str = Field(default="", max_length=32)
    foreman: str = Field(default="", max_length=256)
    site_manager: str = Field(default="", max_length=256)

    work_groups: Any = Field(default=[], sa_column=Column(JSONB_COMPAT, nullable=False, server_default="[]"))
    machinery_groups: Any = Field(default=[], sa_column=Column(JSONB_COMPAT, nullable=False, server_default="[]"))
    material_groups: Any = Field(default=[], sa_column=Column(JSONB_COMPAT, nullable=False, server_default="[]"))
    subcontract_groups: Any = Field(default=[], sa_column=Column(JSONB_COMPAT, nullable=False, server_default="[]"))
    rental_machinery_groups: Any = Field(default=[], sa_column=Column(JSONB_COMPAT, nullable=False, server_default="[]"))

    total_amount: float = Field(default=0.0)

    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)

    __table_args__ = (
        Index(
            "ix_saved_economic_report_tenant_work_report_uq",
            "tenant_id",
            "work_report_id",
            unique=True,
        ),
    )
