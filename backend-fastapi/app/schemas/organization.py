from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OrganizationRead(BaseModel):
    id: str
    name: str
    commercial_name: Optional[str] = None
    logo: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_end_date: Optional[datetime] = None
    trial_end_date: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    invitation_code: Optional[str] = None
    brand_color: Optional[str] = None
    fiscal_id: Optional[str] = None
    legal_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    max_users: int = 25
    current_users: int = 0


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=128)
    commercial_name: Optional[str] = Field(default=None, max_length=256)
    fiscal_id: Optional[str] = Field(default=None, max_length=64)
    legal_name: Optional[str] = Field(default=None, max_length=256)
    email: Optional[str] = Field(default=None, max_length=256)
    phone: Optional[str] = Field(default=None, max_length=64)
    address: Optional[str] = Field(default=None, max_length=512)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=128)
    brand_color: Optional[str] = Field(default=None, max_length=7)
    max_users: Optional[int] = None
    subscription_status: Optional[str] = Field(default=None, max_length=32)
    subscription_end_date: Optional[datetime] = None
    trial_end_date: Optional[datetime] = None


class UserPreferenceRead(BaseModel):
    user_platform: str = "all"
    updated_at: Optional[datetime] = None


class UserPreferenceUpdate(BaseModel):
    user_platform: str = Field(min_length=3, max_length=16)
