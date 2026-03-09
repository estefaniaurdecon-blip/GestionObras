from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.saved_economic_report import (
    SavedEconomicReportCreate,
    SavedEconomicReportListResponse,
    SavedEconomicReportRead,
)
from app.services.saved_economic_report_service import (
    delete_saved_economic_report,
    list_saved_economic_reports,
    upsert_saved_economic_report,
)


router = APIRouter()


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


@router.get(
    "",
    response_model=SavedEconomicReportListResponse,
    summary="Listar reportes economicos guardados",
)
def api_list_saved_economic_reports(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> SavedEconomicReportListResponse:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_saved_economic_reports(
        session,
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=SavedEconomicReportRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear o actualizar reporte economico guardado (upsert por work_report_id)",
)
def api_upsert_saved_economic_report(
    payload: SavedEconomicReportCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> SavedEconomicReportRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return upsert_saved_economic_report(
        session,
        tenant_id=tenant_id,
        user_id=str(current_user.id),
        payload=payload,
    )


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar reporte economico guardado",
)
def api_delete_saved_economic_report(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    deleted = delete_saved_economic_report(
        session,
        tenant_id=tenant_id,
        report_id=report_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reporte no encontrado.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
