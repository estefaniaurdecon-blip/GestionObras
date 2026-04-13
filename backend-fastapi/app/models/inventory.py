from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def _uuid_str() -> str:
    return str(uuid4())


class WorkInventoryItem(SQLModel, table=True):
    __tablename__ = "erp_work_inventory"

    id: str = Field(default_factory=_uuid_str, primary_key=True, max_length=36)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_external_id: str = Field(index=True, max_length=128)

    name: str = Field(max_length=255)
    item_type: str = Field(default="material", max_length=32, index=True)
    category: Optional[str] = Field(default=None, max_length=120)

    quantity: float = Field(default=0)
    unit: str = Field(default="ud", max_length=24)
    last_entry_date: Optional[str] = Field(default=None, max_length=24)
    last_supplier: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, max_length=1000)

    product_code: Optional[str] = Field(default=None, max_length=128)
    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    delivery_note_number: Optional[str] = Field(default=None, max_length=128)
    batch_number: Optional[str] = Field(default=None, max_length=128)
    brand: Optional[str] = Field(default=None, max_length=128)
    model: Optional[str] = Field(default=None, max_length=128)

    is_immediate_consumption: bool = Field(default=False, index=True)
    source: Optional[str] = Field(default=None, max_length=32)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now, index=True)


class InventoryMovement(SQLModel, table=True):
    __tablename__ = "erp_inventory_movement"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_external_id: str = Field(index=True, max_length=128)
    inventory_item_id: str = Field(foreign_key="erp_work_inventory.id", index=True, max_length=36)

    movement_type: str = Field(max_length=16)
    quantity: float = Field(default=0)
    unit: str = Field(default="ud", max_length=24)

    unit_price: Optional[float] = None
    total_price: Optional[float] = None
    supplier: Optional[str] = Field(default=None, max_length=255)
    delivery_note_number: Optional[str] = Field(default=None, max_length=128)
    source: Optional[str] = Field(default=None, max_length=32)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_immediate_consumption: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class WorkInventorySyncLog(SQLModel, table=True):
    __tablename__ = "erp_work_inventory_sync_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_external_id: str = Field(index=True, max_length=128)
    work_report_id: int = Field(foreign_key="erp_work_report.id", index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class PendingDeliveryNote(SQLModel, table=True):
    __tablename__ = "erp_pending_delivery_note"

    id: str = Field(default_factory=_uuid_str, primary_key=True, max_length=36)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    work_external_id: str = Field(index=True, max_length=128)

    supplier: str = Field(max_length=255)
    delivery_note_number: Optional[str] = Field(default=None, max_length=128)
    delivery_date: str = Field(max_length=24, index=True)
    status: str = Field(default="pending", max_length=24, index=True)

    processed_items: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
    )
    raw_ocr_data: Any = Field(default=None, sa_column=Column(JSON, nullable=True))
    ai_confidence: Optional[float] = None
    notes: Optional[str] = Field(default=None, max_length=1000)

    validated_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    validated_at: Optional[datetime] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now, index=True)
