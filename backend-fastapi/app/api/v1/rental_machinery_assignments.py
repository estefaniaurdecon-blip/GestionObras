from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlmodel import Session

from app.api.deps import require_any_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.rental_machinery_assignment import (
    RentalMachineryAssignmentCreate,
    RentalMachineryAssignmentRead,
    RentalMachineryAssignmentUpdate,
)
from app.services.rental_machinery_assignment_service import (
    create_rental_machinery_assignment,
    delete_rental_machinery_assignment,
    list_rental_machinery_assignments,
    update_rental_machinery_assignment,
)


router = APIRouter()


def _tenant_scope(current_user: User, x_tenant_id: Optional[int]) -> int:
    if current_user.is_super_admin:
        tenant_id = x_tenant_id or current_user.tenant_id
    else:
        tenant_id = current_user.tenant_id
        if (
            x_tenant_id is not None
            and tenant_id is not None
            and int(x_tenant_id) != int(tenant_id)
        ):
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


@router.get("", response_model=list[RentalMachineryAssignmentRead], summary="Listar asignaciones de operadores")
def api_list_rental_machinery_assignments(
    rental_machinery_id: Optional[str] = Query(default=None),
    work_id: Optional[str] = Query(default=None),
    assignment_date: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:track", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[RentalMachineryAssignmentRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_rental_machinery_assignments(
        session,
        tenant_id=tenant_id,
        rental_machinery_id=rental_machinery_id,
        work_id=work_id,
        assignment_date=assignment_date,
    )


@router.post(
    "",
    response_model=RentalMachineryAssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear asignacion de operador",
)
def api_create_rental_machinery_assignment(
    payload: RentalMachineryAssignmentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:track", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> RentalMachineryAssignmentRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return create_rental_machinery_assignment(
            session,
            tenant_id=tenant_id,
            current_user=current_user,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch(
    "/{assignment_id}",
    response_model=RentalMachineryAssignmentRead,
    summary="Actualizar asignacion de operador",
)
def api_update_rental_machinery_assignment(
    assignment_id: int,
    payload: RentalMachineryAssignmentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:track", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> RentalMachineryAssignmentRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return update_rental_machinery_assignment(
            session,
            tenant_id=tenant_id,
            assignment_id=assignment_id,
            payload=payload,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_409_CONFLICT if "ya existe" in detail.lower() else status.HTTP_404_NOT_FOUND
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Eliminar asignacion de operador",
)
def api_delete_rental_machinery_assignment(
    assignment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:track", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_rental_machinery_assignment(
            session,
            tenant_id=tenant_id,
            assignment_id=assignment_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
