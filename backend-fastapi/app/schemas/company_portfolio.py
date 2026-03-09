from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CompanyTypeRead(BaseModel):
    id: int
    tenant_id: int
    type_name: str
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class CompanyTypeCreate(BaseModel):
    type_name: str = Field(min_length=1, max_length=128)


class CompanyTypeRename(BaseModel):
    new_type_name: str = Field(min_length=1, max_length=128)


class CompanyPortfolioRead(BaseModel):
    id: int
    tenant_id: int
    company_name: str
    company_type: list[str]
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    fiscal_id: Optional[str] = None
    notes: Optional[str] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    creator_name: Optional[str] = None
    editor_name: Optional[str] = None


class CompanyPortfolioCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    company_type: list[str] = Field(default_factory=list)
    contact_person: Optional[str] = Field(default=None, max_length=255)
    contact_phone: Optional[str] = Field(default=None, max_length=64)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=128)
    fiscal_id: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = None


class CompanyPortfolioUpdate(BaseModel):
    company_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    company_type: Optional[list[str]] = None
    contact_person: Optional[str] = Field(default=None, max_length=255)
    contact_phone: Optional[str] = Field(default=None, max_length=64)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=128)
    fiscal_id: Optional[str] = Field(default=None, max_length=64)
    notes: Optional[str] = None

