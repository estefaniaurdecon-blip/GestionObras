from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ProjectConversationParticipantRead(BaseModel):
    user_id: int
    full_name: str
    email: str | None = None
    joined_at: datetime
    is_active: bool


class ProjectConversationRead(BaseModel):
    id: int
    tenant_id: int
    project_id: int
    creator_group_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime | None = None


class ProjectConversationShellRead(BaseModel):
    conversation: ProjectConversationRead
    participants: list[ProjectConversationParticipantRead]
    created_now: bool


class ProjectConversationMessageUserRead(BaseModel):
    full_name: str


class ProjectConversationMessageRead(BaseModel):
    id: int
    conversation_id: int
    tenant_id: int
    project_id: int
    creator_group_id: int
    from_user_id: int
    message: str
    created_at: datetime
    from_user: ProjectConversationMessageUserRead | None = None


class ProjectConversationMessageCreate(BaseModel):
    message: str


class ProjectConversationMessageListRead(BaseModel):
    conversation: ProjectConversationRead
    items: list[ProjectConversationMessageRead]
