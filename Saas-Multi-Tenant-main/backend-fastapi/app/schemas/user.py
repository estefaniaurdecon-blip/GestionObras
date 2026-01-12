from datetime import datetime

from pydantic import BaseModel, EmailStr


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
    # Nombre de rol lógico (super_admin, tenant_admin, manager, user).
    role_name: str | None = None


class UserRead(UserBase):
    """
    Esquema de lectura de usuario.
    """

    id: int
    tenant_id: int | None
    role_id: int | None
    created_at: datetime


class UserUpdateMe(BaseModel):
    """
    Esquema de actualización del propio usuario.
    Solo permite cambiar datos básicos de perfil.
    """

    full_name: str


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
