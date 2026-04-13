from __future__ import annotations

from datetime import datetime, timedelta
from app.core.datetime import utc_now
from typing import Optional

from sqlmodel import Field, SQLModel


class UserInvitation(SQLModel, table=True):
    """
    InvitaciÃƒÂ³n para crear un usuario por email.

    La invitaciÃƒÂ³n estÃƒÂ¡ ligada a un tenant y a un rol lÃƒÂ³gico
    (por ejemplo: tenant_admin, gerencia, user).
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    email: str = Field(index=True)
    full_name: Optional[str] = Field(default=None)

    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    role_name: str = Field(
        description="Nombre lÃƒÂ³gico del rol (tenant_admin, gerencia, user, etc.)",
        max_length=50,
    )

    token: str = Field(
        unique=True,
        index=True,
        description="Token de invitaciÃƒÂ³n firmado/aleatorio para el alta",
    )

    created_by_id: int = Field(
        foreign_key="user.id",
        description="Usuario que generÃƒÂ³ la invitaciÃƒÂ³n",
    )

    created_at: datetime = Field(default_factory=utc_now)
    expires_at: datetime = Field(
        default_factory=lambda: utc_now() + timedelta(days=7),
        description="Fecha de caducidad de la invitaciÃƒÂ³n",
    )
    used_at: Optional[datetime] = Field(
        default=None,
        description="Momento en el que se aceptÃƒÂ³ la invitaciÃƒÂ³n",
    )

