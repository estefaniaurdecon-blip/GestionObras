from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlmodel import Field, SQLModel


class MFAEmailCode(SQLModel, table=True):
    """
    CÃ³digo MFA enviado por correo electrÃ³nico para un usuario.

    Se usa para el segundo paso del login en usuarios no Super Admin.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(
        index=True,
        description="ID del usuario al que pertenece el cÃ³digo",
    )
    code_hash: str = Field(description="Hash del cÃ³digo MFA enviado por email")
    expires_at: datetime = Field(description="Fecha/hora de expiraciÃ³n del cÃ³digo")
    failed_attempts: int = Field(default=0, description="Intentos fallidos para este cÃ³digo")
    created_at: datetime = Field(default_factory=utc_now)

