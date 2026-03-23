from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PasswordResetToken(SQLModel, table=True):
    """
    Token de un solo uso para recuperación de contraseña.

    Se genera al solicitar el reset, se invalida al usarlo o al expirar.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(
        index=True,
        description="ID del usuario que solicitó el reset",
    )
    token_hash: str = Field(description="Hash del token enviado por email")
    expires_at: datetime = Field(description="Fecha/hora de expiración (1 hora)")
    created_at: datetime = Field(default_factory=datetime.utcnow)
