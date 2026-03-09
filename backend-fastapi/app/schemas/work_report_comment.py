from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WorkReportCommentUserRead(BaseModel):
    full_name: str


class WorkReportCommentRead(BaseModel):
    id: int
    tenant_id: int
    work_report_id: str
    user_id: str
    comment: str
    created_at: datetime
    user: WorkReportCommentUserRead


class WorkReportCommentCreate(BaseModel):
    comment: str = Field(min_length=1, max_length=4000)
