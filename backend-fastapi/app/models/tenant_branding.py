from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class TenantBranding(SQLModel, table=True):
    """
    Branding por tenant (logo y color de acento).
    """

    __tablename__ = "tenant_branding"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True, unique=True)
    accent_color: str = Field(default="#00662b", max_length=7)
    logo_path: Optional[str] = Field(default=None, max_length=512)
    company_name: Optional[str] = Field(default=None, max_length=128)
    company_subtitle: Optional[str] = Field(default=None, max_length=256)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
