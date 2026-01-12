from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.audit import AuditLogRead
from app.services.audit_service import list_audit_logs as svc_list_audit_logs


router = APIRouter()


@router.get(
    "/",
    response_model=List[AuditLogRead],
    summary="Listar registros de auditoria",
)
def list_audit(
    tenant_id: Optional[int] = Query(
        default=None,
        description="Filtrar por ID de tenant (solo Super Admin).",
    ),
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
        description="Número máximo de registros a devolver.",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["audit:read"])),
) -> List[AuditLogRead]:
    """
    Devuelve registros de auditoria visibles para el usuario actual.
    """

    try:
        return svc_list_audit_logs(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            limit=limit,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


