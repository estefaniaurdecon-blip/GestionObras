from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    """
    Usuario de la plataforma.

    Para usuarios asociados a un tenant, se rellena `tenant_id`.
    Para SUPER_ADMIN global, `tenant_id` puede ser `None`.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: str
    hashed_password: str
    is_active: bool = Field(default=True)
    is_super_admin: bool = Field(
        default=False,
        description="Indica si el usuario es un Super Admin global",
    )

    tenant_id: Optional[int] = Field(
        default=None,
        foreign_key="tenant.id",
        description="Tenant al que pertenece el usuario (si aplica)",
    )

    role_id: Optional[int] = Field(
        default=None,
        foreign_key="role.id",
        description="Rol principal del usuario dentro del tenant",
    )

    # Usuario que creó este usuario.
    # Se mantiene como entero simple para no bloquear eliminaciones históricas.
    created_by_user_id: Optional[int] = Field(
        default=None,
        index=True,
        description="ID del usuario creador directo",
    )

    # Grupo lógico de visibilidad basado en la cadena de creación.
    # Todos los usuarios del mismo grupo pueden verse entre sí.
    creator_group_id: Optional[int] = Field(
        default=None,
        index=True,
        description="ID del grupo de creación/visibilidad",
    )

    # Campos para MFA
    mfa_enabled: bool = Field(default=False)
    mfa_secret: Optional[str] = Field(
        default=None,
        description="Clave secreta TOTP para MFA. Solo se guarda si MFA está habilitado.",
    )

    # Idioma preferido del usuario.
    language: str = Field(default="en")
    # URL de la foto de perfil del usuario (opcional).
    avatar_url: Optional[str] = Field(default=None)
    # Avatar almacenado en base64 (data URL).
    avatar_data: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserRead(SQLModel):
    """
    Esquema de salida para usuario.

    No incluye campos sensibles como `hashed_password` ni `mfa_secret`.
    """

    id: int
    email: str
    full_name: str
    is_active: bool
    is_super_admin: bool
    tenant_id: Optional[int]
    role_id: Optional[int]
    created_by_user_id: Optional[int]
    creator_group_id: Optional[int]
    language: str
    avatar_url: Optional[str]
    avatar_data: Optional[str]
