from datetime import datetime

from pydantic import BaseModel, Field


class MessageUserRead(BaseModel):
    full_name: str


class MessageRead(BaseModel):
    id: int
    tenant_id: int
    from_user_id: str
    to_user_id: str
    work_report_id: str | None = None
    message: str
    read: bool
    created_at: datetime
    from_user: MessageUserRead | None = None
    to_user: MessageUserRead | None = None


class MessageCreate(BaseModel):
    to_user_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=4000)
    work_report_id: str | None = Field(default=None, max_length=128)


class MessageListResponse(BaseModel):
    items: list[MessageRead]
    total: int
