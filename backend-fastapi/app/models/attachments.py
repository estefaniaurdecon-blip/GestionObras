from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from uuid import uuid4

from sqlmodel import Field, SQLModel


def _uuid_str() -> str:
    return str(uuid4())


class WorkReportAttachment(SQLModel, table=True):
    __tablename__ = "erp_work_report_attachment"

    id: str = Field(default_factory=_uuid_str, primary_key=True, max_length=36)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_report_id: int = Field(index=True, foreign_key="erp_work_report.id")
    image_url: str = Field(max_length=2048)
    file_path: str = Field(max_length=1024)
    file_name: str = Field(max_length=255)
    content_type: str = Field(max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    display_order: int = Field(default=0, index=True)
    created_by: str | None = Field(default=None, max_length=128)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now, index=True)


class SharedFile(SQLModel, table=True):
    __tablename__ = "erp_shared_file"

    id: str = Field(default_factory=_uuid_str, primary_key=True, max_length=36)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    file_name: str = Field(max_length=255)
    file_path: str = Field(max_length=1024)
    file_size: int = Field(default=0)
    file_type: str = Field(default="application/octet-stream", max_length=120)
    from_user_id: str = Field(index=True, max_length=128)
    to_user_id: str = Field(index=True, max_length=128)
    work_report_id: str | None = Field(default=None, max_length=128)
    message: str | None = Field(default=None, max_length=2000)
    downloaded: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
