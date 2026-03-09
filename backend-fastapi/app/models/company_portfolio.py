from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Index, JSON, Text
from sqlmodel import Field, SQLModel


class CompanyType(SQLModel, table=True):
    __tablename__ = "erp_company_type"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    type_name: str = Field(max_length=128, index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_erp_company_type_tenant_name_uq", "tenant_id", "type_name", unique=True),
    )


class CompanyPortfolio(SQLModel, table=True):
    __tablename__ = "erp_company_portfolio"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    company_name: str = Field(max_length=255, index=True)
    company_type: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
    )
    contact_person: Optional[str] = Field(default=None, max_length=255)
    contact_phone: Optional[str] = Field(default=None, max_length=64)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=128)
    fiscal_id: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_erp_company_portfolio_tenant_name", "tenant_id", "company_name"),
    )

