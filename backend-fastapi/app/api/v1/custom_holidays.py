from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.custom_holiday import (
    CustomHolidayCreate,
    CustomHolidayRead,
    CustomHolidayUpdate,
)
from app.services.custom_holiday_service import (
    create_custom_holiday,
    delete_custom_holiday,
    list_custom_holidays,
    update_custom_holiday,
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


@router.get("", response_model=list[CustomHolidayRead], summary="Listar festivos personalizados")
def api_list_custom_holidays(
    region: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[CustomHolidayRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_custom_holidays(session, tenant_id=tenant_id, region=region)


@router.post(
    "",
    response_model=CustomHolidayRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear festivo personalizado",
)
def api_create_custom_holiday(
    payload: CustomHolidayCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> CustomHolidayRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return create_custom_holiday(
        session,
        tenant_id=tenant_id,
        current_user=current_user,
        payload=payload,
    )


@router.patch(
    "/{holiday_id}",
    response_model=CustomHolidayRead,
    summary="Actualizar festivo personalizado",
)
def api_update_custom_holiday(
    holiday_id: int,
    payload: CustomHolidayUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> CustomHolidayRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return update_custom_holiday(
            session,
            tenant_id=tenant_id,
            holiday_id=holiday_id,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Eliminar festivo personalizado",
)
def api_delete_custom_holiday(
    holiday_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_custom_holiday(
            session,
            tenant_id=tenant_id,
            holiday_id=holiday_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
