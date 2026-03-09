from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import require_any_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.work_report_comment import WorkReportCommentCreate, WorkReportCommentRead
from app.services.work_report_comment_service import (
    create_work_report_comment,
    list_work_report_comments,
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


@router.get(
    "/work-reports/{work_report_id}/comments",
    response_model=list[WorkReportCommentRead],
    summary="Listar comentarios de un parte",
)
def api_list_work_report_comments(
    work_report_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:track", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[WorkReportCommentRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_work_report_comments(
        session,
        tenant_id=tenant_id,
        work_report_id=work_report_id,
    )


@router.post(
    "/work-reports/{work_report_id}/comments",
    response_model=WorkReportCommentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear comentario en un parte",
)
def api_create_work_report_comment(
    work_report_id: str,
    payload: WorkReportCommentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:track", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> WorkReportCommentRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return create_work_report_comment(
        session,
        tenant_id=tenant_id,
        work_report_id=work_report_id,
        current_user=current_user,
        payload=payload,
    )
