from datetime import datetime

from pydantic import BaseModel


class TenantBase(BaseModel):
    name: str
    subdomain: str
    is_active: bool = True


class TenantCreate(TenantBase):
    """
    Esquema de creación de tenant.
    """


class TenantRead(TenantBase):
    """
    Esquema de lectura de tenant.
    """

    id: int
    created_at: datetime

