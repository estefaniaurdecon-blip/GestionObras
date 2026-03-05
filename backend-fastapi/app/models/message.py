from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    from_user_id: str = Field(index=True, max_length=128)
    to_user_id: str = Field(index=True, max_length=128)

    work_report_id: str | None = Field(default=None, max_length=128)
    message: str = Field(max_length=4000)
    is_read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
