from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SavedEconomicReportRead(BaseModel):
    id: int
    tenant_id: int
    work_report_id: str
    saved_by: str
    work_name: str
    work_number: str
    date: str
    foreman: str
    site_manager: str
    work_groups: list[Any] = []
    machinery_groups: list[Any] = []
    material_groups: list[Any] = []
    subcontract_groups: list[Any] = []
    rental_machinery_groups: list[Any] = []
    total_amount: float
    created_at: datetime
    updated_at: datetime


class SavedEconomicReportCreate(BaseModel):
    work_report_id: str = Field(min_length=1, max_length=256)
    work_name: str = Field(default="", max_length=512)
    work_number: str = Field(default="", max_length=128)
    date: str = Field(default="", max_length=32)
    foreman: str = Field(default="", max_length=256)
    site_manager: str = Field(default="", max_length=256)
    work_groups: list[Any] = []
    machinery_groups: list[Any] = []
    material_groups: list[Any] = []
    subcontract_groups: list[Any] = []
    rental_machinery_groups: list[Any] = []
    total_amount: float = 0.0


class SavedEconomicReportListResponse(BaseModel):
    items: list[SavedEconomicReportRead]
    total: int
