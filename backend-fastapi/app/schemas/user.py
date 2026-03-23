from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_active: bool = True
    is_super_admin: bool = False


class UserCreate(BaseModel):
    """
    Esquema de entrada para crear usuarios.
    """

    email: EmailStr
    full_name: str
    password: str
    tenant_id: int | None = None
    is_super_admin: bool = False
    # Nombre de rol lógico (super_admin, tenant_admin, gerencia, user).
    role_name: str | None = None


class UserRead(UserBase):
    """
    Esquema de lectura de usuario.
    """

    id: int
    tenant_id: int | None
    role_id: int | None
    role_name: str | None = None
    permissions: list[str] = Field(default_factory=list)
    language: str | None = None
    avatar_url: str | None = None
    avatar_data: str | None = None
    created_at: datetime


class UserContactRead(BaseModel):
    """
    Esquema de lectura reducido para contactos del tenant.
    """

    id: int
    email: EmailStr
    full_name: str
    is_active: bool = True
    is_super_admin: bool = False
    tenant_id: int | None = None
    role_name: str | None = None
    avatar_url: str | None = None


class UserUpdateMe(BaseModel):
    """
    Esquema de actualización del propio usuario.
    Solo permite cambiar datos básicos de perfil.
    """

    full_name: str
    language: str | None = None
    avatar_url: str | None = None


class UserStatusUpdate(BaseModel):
    """
    Esquema para activar o desactivar un usuario.
    """

    is_active: bool


class UserUpdateMe(BaseModel):
    """
    Esquema de actualización del propio usuario.
    Solo permite cambiar datos básicos de perfil.
    """

    full_name: str
    language: str | None = None
    avatar_url: str | None = None


class UserUpdateAdmin(BaseModel):
    """
    Esquema para editar usuarios desde administración.
    """

    email: EmailStr | None = None
    full_name: str | None = None
    role_name: str | None = None
