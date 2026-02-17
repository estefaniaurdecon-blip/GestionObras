from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    """
    Registro de auditori­a de acciones importantes en el sistema.

    Permite rastrear quien hizo que y cuando.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    # Referencia al usuario que realiza la acciÃ³n (si estÃ¡ autenticado)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")

    # Tenant en el que se ha producido la acciÃ³n (si aplica)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")

    # Fuente del evento (web o app)
    source: Optional[str] = Field(default="app")

    action: str = Field(description="Descripcion corta de la acciÃ³n")
    details: str | None = Field(
        default=None,
        description="Detalles adicionales (JSON, texto, etc.)",
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)


