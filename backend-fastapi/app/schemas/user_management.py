from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


AppRole = Literal["master", "admin", "site_manager", "foreman", "reader", "ofi"]


class UserProfileRead(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None
    approved: bool
    created_at: datetime
    updated_at: datetime
    organization_id: int


class UserRolesRead(BaseModel):
    user_id: int
    roles: list[AppRole]


class UserRoleUpsertPayload(BaseModel):
    role: AppRole


class UserRoleDeletePayload(BaseModel):
    role: AppRole


class UserApprovePayload(BaseModel):
    role: AppRole = Field(default="foreman")


class UserAssignmentsRead(BaseModel):
    user_id: int
    work_ids: list[int]


class WorkAssignmentCreatePayload(BaseModel):
    user_id: int
    work_id: int


class WorkMemberRead(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None


class WorkMessageDirectoryRead(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    visible_member_count: int
