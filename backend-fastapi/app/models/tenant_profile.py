from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class TenantProfile(SQLModel, table=True):
    """
    Datos ampliados de organizacion por tenant.
    """

    __tablename__ = "tenant_profile"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True, unique=True)
    fiscal_id: Optional[str] = Field(default=None, max_length=64)
    legal_name: Optional[str] = Field(default=None, max_length=256)
    commercial_name: Optional[str] = Field(default=None, max_length=256)
    email: Optional[str] = Field(default=None, max_length=256)
    phone: Optional[str] = Field(default=None, max_length=64)
    address: Optional[str] = Field(default=None, max_length=512)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default="Espana", max_length=128)
    max_users: int = Field(default=25)
    subscription_status: Optional[str] = Field(default="trial", max_length=32)
    subscription_end_date: Optional[datetime] = Field(default=None)
    trial_end_date: Optional[datetime] = Field(default=None)
    invitation_code: Optional[str] = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
