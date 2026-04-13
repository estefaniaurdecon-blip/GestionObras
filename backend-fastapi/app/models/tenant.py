from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlmodel import Field, SQLModel


class Tenant(SQLModel, table=True):
    """
    Representa una empresa / cliente dentro del sistema.

    La clave `subdomain` permite trabajar con subdominios del tipo:
    - `cliente1.empresa.com`
    - `cliente2.empresa.com`
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, description="Nombre comercial del tenant")
    subdomain: str = Field(
        index=True,
        unique=True,
        description="Subdominio asignado al tenant (ej: acme)",
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=utc_now,
        description="Fecha de creaciÃ³n del tenant",
    )

