from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.inventory import InventoryMovement, PendingDeliveryNote, WorkInventoryItem
from app.models.user import User


router = APIRouter()

_ALLOWED_MOVEMENT_TYPES = {"entry", "exit", "transfer", "adjustment"}


class InventoryMovementCreateRequest(BaseModel):
    work_id: str
    inventory_item_id: str
    movement_type: str
    quantity: float
    unit: str = "ud"
    unit_price: float | None = None
    total_price: float | None = None
    source: str | None = None
    is_immediate_consumption: bool = False
    delivery_note_number: str | None = None
    supplier: str | None = None
    notes: str | None = None


class InventoryMovementUpdateRequest(BaseModel):
    movement_type: str | None = None
    quantity: float | None = None
    unit: str | None = None
    unit_price: float | None = None
    total_price: float | None = None
    source: str | None = None
    is_immediate_consumption: bool | None = None
    delivery_note_number: str | None = None
    supplier: str | None = None
    notes: str | None = None


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


def _normalize_text(value: str | None, *, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def _normalize_movement_type(value: str | None) -> str:
    movement_type = _normalize_text(value).lower()
    if movement_type not in _ALLOWED_MOVEMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de movimiento no valido.",
        )
    return movement_type


def _safe_total_price(quantity: float, unit_price: float | None, total_price: float | None) -> float | None:
    if total_price is not None:
        return float(total_price)
    if unit_price is None:
        return None
    return float(quantity) * float(unit_price)


def _movement_to_dict(
    movement: InventoryMovement,
    inventory_map: dict[str, WorkInventoryItem],
) -> dict[str, Any]:
    inventory_item = inventory_map.get(movement.inventory_item_id)
    item_name = inventory_item.name if inventory_item else "Elemento"
    item_type = inventory_item.item_type if inventory_item else "material"
    item_category = inventory_item.category if inventory_item else None

    return {
        "id": str(movement.id),
        "item_name": item_name,
        "item_type": item_type,
        "item_category": item_category,
        "movement_type": movement.movement_type,
        "quantity": float(movement.quantity or 0),
        "unit": movement.unit,
        "unit_price": movement.unit_price,
        "total_price": movement.total_price,
        "source": movement.source or "manual",
        "is_immediate_consumption": bool(movement.is_immediate_consumption),
        "delivery_note_number": movement.delivery_note_number,
        "supplier": movement.supplier,
        "notes": movement.notes,
        "created_at": movement.created_at.isoformat(),
        "created_by": None,
        "work_id": movement.work_external_id,
    }


def _resolve_item_bucket(item: WorkInventoryItem) -> str:
    item_type = _normalize_text(item.item_type).lower()
    category = _normalize_text(item.category).lower()
    if item_type == "material":
        return "material"
    if item_type == "machinery" or "maquinaria" in category:
        return "machinery"
    return "tool"


@router.get("")
def list_inventory_movements(
    work_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> list[dict[str, Any]]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    statement = select(InventoryMovement).where(InventoryMovement.tenant_id == tenant_id)
    if work_id:
        statement = statement.where(InventoryMovement.work_external_id == work_id)
    statement = statement.order_by(InventoryMovement.created_at.desc()).limit(limit)

    movements = session.exec(statement).all()
    inventory_ids = {movement.inventory_item_id for movement in movements if movement.inventory_item_id}
    inventory_items = []
    if inventory_ids:
        inventory_items = session.exec(
            select(WorkInventoryItem).where(
                WorkInventoryItem.tenant_id == tenant_id,
                WorkInventoryItem.id.in_(inventory_ids),
            )
        ).all()
    inventory_map = {item.id: item for item in inventory_items}

    return [_movement_to_dict(movement, inventory_map) for movement in movements]


@router.get("/kpis")
def get_inventory_kpis(
    work_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)

    inventory_statement = select(WorkInventoryItem).where(WorkInventoryItem.tenant_id == tenant_id)
    if work_id:
        inventory_statement = inventory_statement.where(WorkInventoryItem.work_external_id == work_id)
    inventory_items = session.exec(inventory_statement).all()

    pending_statement = select(PendingDeliveryNote).where(
        PendingDeliveryNote.tenant_id == tenant_id,
        PendingDeliveryNote.status == "pending",
    )
    if work_id:
        pending_statement = pending_statement.where(PendingDeliveryNote.work_external_id == work_id)
    pending_notes = session.exec(pending_statement).all()

    movement_statement = select(InventoryMovement).where(
        InventoryMovement.tenant_id == tenant_id,
        InventoryMovement.is_immediate_consumption.is_(True),
    )
    if work_id:
        movement_statement = movement_statement.where(InventoryMovement.work_external_id == work_id)
    movement_statement = movement_statement.order_by(InventoryMovement.created_at.desc()).limit(100)
    recent_movements_raw = session.exec(movement_statement).all()

    movement_inventory_ids = {movement.inventory_item_id for movement in recent_movements_raw if movement.inventory_item_id}
    movement_inventory_items = []
    if movement_inventory_ids:
        movement_inventory_items = session.exec(
            select(WorkInventoryItem).where(
                WorkInventoryItem.tenant_id == tenant_id,
                WorkInventoryItem.id.in_(movement_inventory_ids),
            )
        ).all()
    movement_inventory_map = {item.id: item for item in movement_inventory_items}

    stock_items = [item for item in inventory_items if not item.is_immediate_consumption]
    total_stock_value = sum(float(item.total_price or 0) for item in stock_items)
    direct_consumption_value = sum(
        float(movement.total_price or 0)
        for movement in recent_movements_raw
        if movement.movement_type == "entry"
    )

    total_material_items = 0
    total_tool_items = 0
    total_machinery_items = 0
    for item in inventory_items:
        bucket = _resolve_item_bucket(item)
        if bucket == "material":
            total_material_items += 1
        elif bucket == "machinery":
            total_machinery_items += 1
        else:
            total_tool_items += 1

    recent_movements = [_movement_to_dict(movement, movement_inventory_map) for movement in recent_movements_raw][:10]

    return {
        "totalStockValue": total_stock_value,
        "directConsumptionValue": direct_consumption_value,
        "totalMaterialItems": total_material_items,
        "totalToolItems": total_tool_items,
        "totalMachineryItems": total_machinery_items,
        "pendingDeliveryNotes": len(pending_notes),
        "recentMovements": recent_movements,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_inventory_movement(
    payload: InventoryMovementCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    work_id = _normalize_text(payload.work_id)
    if not work_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="work_id es obligatorio.",
        )

    inventory_item = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.id == payload.inventory_item_id,
            WorkInventoryItem.tenant_id == tenant_id,
            WorkInventoryItem.work_external_id == work_id,
        )
    ).first()
    if not inventory_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item de inventario no encontrado.",
        )

    quantity = float(payload.quantity or 0)
    movement = InventoryMovement(
        tenant_id=tenant_id,
        work_external_id=work_id,
        inventory_item_id=payload.inventory_item_id,
        movement_type=_normalize_movement_type(payload.movement_type),
        quantity=quantity,
        unit=_normalize_text(payload.unit, fallback="ud"),
        unit_price=payload.unit_price,
        total_price=_safe_total_price(quantity, payload.unit_price, payload.total_price),
        supplier=_normalize_text(payload.supplier) or None,
        delivery_note_number=_normalize_text(payload.delivery_note_number) or None,
        source=_normalize_text(payload.source) or "manual",
        notes=_normalize_text(payload.notes) or None,
        is_immediate_consumption=bool(payload.is_immediate_consumption),
        created_at=datetime.utcnow(),
    )
    session.add(movement)
    session.commit()
    session.refresh(movement)
    return _movement_to_dict(movement, {inventory_item.id: inventory_item})


@router.patch("/{movement_id}")
def update_inventory_movement(
    movement_id: int,
    payload: InventoryMovementUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, Any]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    movement = session.exec(
        select(InventoryMovement).where(
            InventoryMovement.id == movement_id,
            InventoryMovement.tenant_id == tenant_id,
        )
    ).first()
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movimiento no encontrado.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "movement_type" in updates:
        movement.movement_type = _normalize_movement_type(payload.movement_type)
    if "quantity" in updates:
        movement.quantity = float(payload.quantity or 0)
    if "unit" in updates:
        movement.unit = _normalize_text(payload.unit, fallback="ud")
    if "unit_price" in updates:
        movement.unit_price = payload.unit_price
    if "total_price" in updates:
        movement.total_price = payload.total_price
    elif "quantity" in updates or "unit_price" in updates:
        movement.total_price = _safe_total_price(
            float(movement.quantity or 0),
            movement.unit_price,
            movement.total_price,
        )
    if "source" in updates:
        movement.source = _normalize_text(payload.source) or None
    if "is_immediate_consumption" in updates:
        movement.is_immediate_consumption = bool(payload.is_immediate_consumption)
    if "delivery_note_number" in updates:
        movement.delivery_note_number = _normalize_text(payload.delivery_note_number) or None
    if "supplier" in updates:
        movement.supplier = _normalize_text(payload.supplier) or None
    if "notes" in updates:
        movement.notes = _normalize_text(payload.notes) or None

    session.add(movement)
    session.commit()
    session.refresh(movement)

    inventory_item = session.exec(
        select(WorkInventoryItem).where(
            WorkInventoryItem.id == movement.inventory_item_id,
            WorkInventoryItem.tenant_id == tenant_id,
        )
    ).first()
    inventory_map = {inventory_item.id: inventory_item} if inventory_item else {}
    return _movement_to_dict(movement, inventory_map)


@router.delete(
    "/{movement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_inventory_movement(
    movement_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    movement = session.exec(
        select(InventoryMovement).where(
            InventoryMovement.id == movement_id,
            InventoryMovement.tenant_id == tenant_id,
        )
    ).first()
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movimiento no encontrado.",
        )
    session.delete(movement)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
