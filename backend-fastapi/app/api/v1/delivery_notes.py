from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.inventory import InventoryMovement, PendingDeliveryNote, WorkInventoryItem
from app.models.user import User


router = APIRouter()

_ALLOWED_STATUSES = {"pending", "validated", "rejected"}
_TOOL_TYPES = {"tool", "machinery", "herramienta"}


class DeliveryNoteItem(BaseModel):
    id: str | None = None
    name: str
    quantity: float = 0
    unit: str = "ud"
    unit_price: float | None = None
    total_price: float | None = None
    item_type: str = "material"
    category: str | None = None
    is_immediate_consumption: bool = False
    ai_confidence: float | None = None
    serial_number: str | None = None
    brand: str | None = None
    model: str | None = None
    user_corrected: bool | None = None


class DeliveryNoteCreateRequest(BaseModel):
    work_id: str
    supplier: str
    delivery_note_number: str | None = None
    delivery_date: str
    status: str = "pending"
    processed_items: list[DeliveryNoteItem] = Field(default_factory=list)
    raw_ocr_data: Any = None
    ai_confidence: float | None = None
    notes: str | None = None


class DeliveryNoteUpdateRequest(BaseModel):
    supplier: str | None = None
    delivery_note_number: str | None = None
    delivery_date: str | None = None
    status: str | None = None
    processed_items: list[DeliveryNoteItem] | None = None
    raw_ocr_data: Any = None
    ai_confidence: float | None = None
    notes: str | None = None


class DeliveryNoteValidateRequest(BaseModel):
    work_id: str
    items: list[DeliveryNoteItem] = Field(default_factory=list)


class DeliveryNoteRejectRequest(BaseModel):
    reason: str | None = None


def _tenant_scope(current_user: User, x_tenant_id: int | None) -> int:
    if current_user.is_super_admin:
        tenant_id = x_tenant_id or current_user.tenant_id
    else:
        tenant_id = current_user.tenant_id
        if x_tenant_id is not None and tenant_id is not None and int(x_tenant_id) != int(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para ese tenant.",
            )

    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
    return int(tenant_id)


def _normalize_status(value: Optional[str]) -> str:
    status_value = str(value or "pending").strip().lower()
    if status_value not in _ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estado de albaran no valido.",
        )
    return status_value


def _normalize_text(value: str | None, *, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _serialize_items(items: list[DeliveryNoteItem]) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for item in items:
        serialized.append(item.model_dump())
    return serialized


def _delivery_note_to_dict(note: PendingDeliveryNote) -> dict[str, Any]:
    return {
        "id": note.id,
        "supplier": note.supplier,
        "delivery_note_number": note.delivery_note_number,
        "delivery_date": note.delivery_date,
        "status": note.status,
        "processed_items": note.processed_items or [],
        "raw_ocr_data": note.raw_ocr_data,
        "ai_confidence": note.ai_confidence,
        "work_id": note.work_external_id,
        "organization_id": str(note.tenant_id),
        "created_at": note.created_at.isoformat(),
        "notes": note.notes,
        "validated_at": note.validated_at.isoformat() if note.validated_at else None,
        "validated_by": note.validated_by_id,
    }


def _load_delivery_note(
    session: Session,
    note_id: str,
    tenant_id: int,
) -> PendingDeliveryNote:
    note = session.exec(
        select(PendingDeliveryNote).where(
            PendingDeliveryNote.id == note_id,
            PendingDeliveryNote.tenant_id == tenant_id,
        )
    ).first()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Albaran no encontrado.",
        )
    return note


@router.get("")
def list_delivery_notes(
    work_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> list[dict[str, Any]]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    statement = select(PendingDeliveryNote).where(PendingDeliveryNote.tenant_id == tenant_id)
    if work_id:
        statement = statement.where(PendingDeliveryNote.work_external_id == work_id)

    normalized_status: str | None = None
    if status_filter:
        normalized_status = _normalize_status(status_filter)
        statement = statement.where(PendingDeliveryNote.status == normalized_status)

    if normalized_status == "validated":
        statement = statement.order_by(PendingDeliveryNote.validated_at.desc())
    else:
        statement = statement.order_by(PendingDeliveryNote.created_at.desc())

    notes = session.exec(statement.limit(limit)).all()
    return [_delivery_note_to_dict(note) for note in notes]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_delivery_note(
    payload: DeliveryNoteCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    now = datetime.utcnow()

    note = PendingDeliveryNote(
        tenant_id=tenant_id,
        work_external_id=_normalize_text(payload.work_id),
        supplier=_normalize_text(payload.supplier),
        delivery_note_number=_normalize_text(payload.delivery_note_number) or None,
        delivery_date=_normalize_text(payload.delivery_date),
        status=_normalize_status(payload.status),
        processed_items=_serialize_items(payload.processed_items),
        raw_ocr_data=payload.raw_ocr_data,
        ai_confidence=payload.ai_confidence,
        notes=_normalize_text(payload.notes) or None,
        created_at=now,
        updated_at=now,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return _delivery_note_to_dict(note)


@router.patch("/{note_id}")
def update_delivery_note(
    note_id: str,
    payload: DeliveryNoteUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    note = _load_delivery_note(session, note_id, tenant_id)
    updates = payload.model_dump(exclude_unset=True)

    if "supplier" in updates:
        note.supplier = _normalize_text(payload.supplier)
    if "delivery_note_number" in updates:
        note.delivery_note_number = _normalize_text(payload.delivery_note_number) or None
    if "delivery_date" in updates:
        note.delivery_date = _normalize_text(payload.delivery_date)
    if "status" in updates:
        note.status = _normalize_status(payload.status)
        if note.status in {"validated", "rejected"}:
            note.validated_by_id = current_user.id
            note.validated_at = datetime.utcnow()
    if "processed_items" in updates and payload.processed_items is not None:
        note.processed_items = _serialize_items(payload.processed_items)
    if "raw_ocr_data" in updates:
        note.raw_ocr_data = payload.raw_ocr_data
    if "ai_confidence" in updates:
        note.ai_confidence = payload.ai_confidence
    if "notes" in updates:
        note.notes = _normalize_text(payload.notes) or None

    note.updated_at = datetime.utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    return _delivery_note_to_dict(note)


@router.delete(
    "/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_delivery_note(
    note_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    note = _load_delivery_note(session, note_id, tenant_id)
    session.delete(note)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{note_id}/validate")
def validate_delivery_note(
    note_id: str,
    payload: DeliveryNoteValidateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    note = _load_delivery_note(session, note_id, tenant_id)

    work_id = _normalize_text(payload.work_id)
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id es obligatorio.",
        )
    note.work_external_id = work_id

    supplier = _normalize_text(note.supplier)
    delivery_note_number = _normalize_text(note.delivery_note_number) or None
    today = datetime.utcnow().date().isoformat()
    items = payload.items
    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay items para validar.",
        )

    for item in items:
        item_name = _normalize_text(item.name)
        if not item_name:
            continue

        normalized_type = _normalize_text(item.item_type, fallback="material").lower()
        inventory_item_type = "material"
        if normalized_type in _TOOL_TYPES:
            inventory_item_type = "herramienta"

        quantity = float(item.quantity or 0)
        unit = _normalize_text(item.unit, fallback="ud")
        unit_price = item.unit_price
        total_price = item.total_price
        if total_price is None and unit_price is not None:
            total_price = float(quantity) * float(unit_price)

        inventory_item = WorkInventoryItem(
            tenant_id=tenant_id,
            work_external_id=work_id,
            name=item_name,
            item_type=inventory_item_type,
            category=item.category,
            quantity=0 if item.is_immediate_consumption else quantity,
            unit=unit,
            unit_price=unit_price,
            total_price=total_price,
            is_immediate_consumption=item.is_immediate_consumption,
            source="ai",
            last_supplier=supplier or None,
            delivery_note_number=delivery_note_number,
            last_entry_date=today,
        )
        session.add(inventory_item)
        session.flush()

        entry_movement = InventoryMovement(
            tenant_id=tenant_id,
            work_external_id=work_id,
            inventory_item_id=inventory_item.id,
            movement_type="entry",
            quantity=quantity,
            unit=unit,
            unit_price=unit_price,
            total_price=total_price,
            supplier=supplier or None,
            delivery_note_number=delivery_note_number,
            source="ai",
            is_immediate_consumption=item.is_immediate_consumption,
        )
        session.add(entry_movement)

        if item.is_immediate_consumption:
            exit_movement = InventoryMovement(
                tenant_id=tenant_id,
                work_external_id=work_id,
                inventory_item_id=inventory_item.id,
                movement_type="exit",
                quantity=quantity,
                unit=unit,
                unit_price=unit_price,
                total_price=total_price,
                supplier=supplier or None,
                delivery_note_number=delivery_note_number,
                source="auto_consumption",
                notes="Consumo automatico - material de ejecucion inmediata",
                is_immediate_consumption=True,
            )
            session.add(exit_movement)

    note.status = "validated"
    note.validated_by_id = current_user.id
    note.validated_at = datetime.utcnow()
    note.processed_items = _serialize_items(items)
    note.updated_at = datetime.utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)

    return {
        "success": True,
        "note": _delivery_note_to_dict(note),
    }


@router.post("/{note_id}/reject")
def reject_delivery_note(
    note_id: str,
    payload: DeliveryNoteRejectRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    note = _load_delivery_note(session, note_id, tenant_id)

    note.status = "rejected"
    note.validated_by_id = current_user.id
    note.validated_at = datetime.utcnow()
    if payload.reason:
        note.notes = _normalize_text(payload.reason)
    note.updated_at = datetime.utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)

    return {
        "success": True,
        "note": _delivery_note_to_dict(note),
    }
