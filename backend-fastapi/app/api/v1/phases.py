from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.phase import PhaseCreate, PhaseRead, PhaseUpdate
from app.services.phase_service import (
    create_phase,
    delete_phase,
    list_phases,
    phase_has_children,
    update_phase,
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


@router.get("", response_model=list[PhaseRead], summary="Listar fases")
def api_list_phases(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[PhaseRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_phases(session, tenant_id=tenant_id)


@router.post(
    "",
    response_model=PhaseRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear fase",
)
def api_create_phase(
    payload: PhaseCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> PhaseRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return create_phase(
            session,
            tenant_id=tenant_id,
            current_user=current_user,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{phase_id}", response_model=PhaseRead, summary="Actualizar fase")
def api_update_phase(
    phase_id: int,
    payload: PhaseUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> PhaseRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return update_phase(
            session,
            tenant_id=tenant_id,
            phase_id=phase_id,
            payload=payload,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if "no encontrada" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/{phase_id}/has-children", summary="Comprobar si una fase tiene partes asociados")
def api_phase_has_children(
    phase_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> dict[str, bool]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return {"has_children": phase_has_children(session, tenant_id=tenant_id, phase_id=phase_id)}


@router.delete(
    "/{phase_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Eliminar fase",
)
def api_delete_phase(
    phase_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_phase(session, tenant_id=tenant_id, phase_id=phase_id)
    except RuntimeError as exc:
        if str(exc) == "PHASE_HAS_CHILDREN":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="PHASE_HAS_CHILDREN",
            ) from exc
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

