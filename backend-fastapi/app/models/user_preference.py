from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class UserPreference(SQLModel, table=True):
    """
    Preferencias no criticas del usuario autenticado.
    """

    __tablename__ = "user_preference"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    user_platform: str = Field(default="all", max_length=16)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
