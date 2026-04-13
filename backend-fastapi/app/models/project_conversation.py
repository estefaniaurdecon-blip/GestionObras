from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, SQLModel


class ProjectConversation(SQLModel, table=True):
    __tablename__ = "project_conversation"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)
    creator_group_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now, index=True)
    last_message_at: datetime | None = Field(default=None, index=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "project_id",
            "creator_group_id",
            name="uq_project_conversation_tenant_project_group",
        ),
    )


class ProjectConversationParticipant(SQLModel, table=True):
    __tablename__ = "project_conversation_participant"

    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="project_conversation.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)
    creator_group_id: int = Field(foreign_key="user.id", index=True)
    is_active: bool = Field(default=True, index=True)
    joined_at: datetime = Field(default_factory=utc_now, index=True)
    left_at: datetime | None = Field(default=None, index=True)
    last_read_at: datetime | None = Field(default=None, index=True)

    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "user_id",
            name="uq_project_conversation_participant_conversation_user",
        ),
        Index(
            "ix_project_conversation_participant_scope",
            "tenant_id",
            "project_id",
            "creator_group_id",
        ),
    )


class ProjectConversationMessage(SQLModel, table=True):
    __tablename__ = "project_conversation_message"

    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="project_conversation.id", index=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    project_id: int = Field(foreign_key="erp_project.id", index=True)
    creator_group_id: int = Field(foreign_key="user.id", index=True)
    from_user_id: int = Field(foreign_key="user.id", index=True)
    message: str = Field(max_length=4000)
    created_at: datetime = Field(default_factory=utc_now, index=True)

    __table_args__ = (
        Index(
            "ix_project_conversation_message_scope",
            "tenant_id",
            "project_id",
            "creator_group_id",
            "created_at",
        ),
    )
