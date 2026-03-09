from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlmodel import Session

from app.api.deps import require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.user_management import (
    AppRole,
    UserApprovePayload,
    UserAssignmentsRead,
    UserProfileRead,
    UserRoleUpsertPayload,
    UserRolesRead,
    WorkAssignmentCreatePayload,
)
from app.services.user_management_service import (
    add_user_role,
    approve_user,
    assign_user_to_work,
    delete_user_related_data,
    list_assignable_foremen,
    list_user_assignments,
    list_user_profiles,
    list_user_roles,
    remove_user_from_work,
    remove_user_role,
)
from app.services.user_service import delete_user as delete_user_service


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


@router.get("/users", response_model=list[UserProfileRead], summary="Listar usuarios del tenant")
def api_list_user_profiles(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[UserProfileRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_user_profiles(session, tenant_id=tenant_id)


@router.get("/users/{user_id}/roles", response_model=UserRolesRead, summary="Listar roles de app de un usuario")
def api_list_user_roles(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserRolesRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return list_user_roles(session, tenant_id=tenant_id, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/users/{user_id}/roles", response_model=UserRolesRead, summary="Agregar rol de app a un usuario")
def api_add_user_role(
    user_id: int,
    payload: UserRoleUpsertPayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserRolesRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return add_user_role(
            session,
            tenant_id=tenant_id,
            current_user_id=current_user.id,
            user_id=user_id,
            role=payload.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/users/{user_id}/roles/{role}",
    response_model=UserRolesRead,
    summary="Eliminar rol de app de un usuario",
)
def api_remove_user_role(
    user_id: int,
    role: AppRole,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserRolesRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return remove_user_role(
            session,
            tenant_id=tenant_id,
            user_id=user_id,
            role=role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/users/{user_id}/approve", response_model=UserProfileRead, summary="Aprobar usuario")
def api_approve_user(
    user_id: int,
    payload: UserApprovePayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserProfileRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return approve_user(
            session,
            tenant_id=tenant_id,
            current_user_id=current_user.id,
            user_id=user_id,
            role=payload.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/users/{user_id}/assignments",
    response_model=UserAssignmentsRead,
    summary="Listar asignaciones de obras de un usuario",
)
def api_list_user_assignments(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserAssignmentsRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return list_user_assignments(session, tenant_id=tenant_id, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/assignments", response_model=UserAssignmentsRead, summary="Asignar usuario a obra")
def api_assign_user_to_work(
    payload: WorkAssignmentCreatePayload,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserAssignmentsRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return assign_user_to_work(
            session,
            tenant_id=tenant_id,
            current_user_id=current_user.id,
            user_id=payload.user_id,
            work_id=payload.work_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/assignments", response_model=UserAssignmentsRead, summary="Eliminar asignacion usuario-obra")
def api_remove_user_from_work(
    user_id: int = Query(...),
    work_id: int = Query(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> UserAssignmentsRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return remove_user_from_work(
            session,
            tenant_id=tenant_id,
            user_id=user_id,
            work_id=work_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/assignable-foremen", response_model=list[UserProfileRead], summary="Listar capataces asignables")
def api_list_assignable_foremen(
    organization_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[UserProfileRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    if organization_id is not None and int(organization_id) != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para ese tenant.",
        )
    return list_assignable_foremen(session, tenant_id=tenant_id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def api_delete_user_and_data(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:delete"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_user_related_data(session, tenant_id=tenant_id, user_id=user_id)
        delete_user_service(session, current_user=current_user, user_id=user_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

