from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlmodel import Field, SQLModel


class PasswordResetToken(SQLModel, table=True):
    """
    Token de un solo uso para recuperaciÃ³n de contraseÃ±a.

    Se genera al solicitar el reset, se invalida al usarlo o al expirar.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(
        index=True,
        description="ID del usuario que solicitÃ³ el reset",
    )
    token_hash: str = Field(description="Hash del token enviado por email")
    expires_at: datetime = Field(description="Fecha/hora de expiraciÃ³n (1 hora)")
    created_at: datetime = Field(default_factory=utc_now)
