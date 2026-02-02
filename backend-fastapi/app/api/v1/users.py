from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session

from app.api.deps import (
    get_current_active_user,
    require_permissions,
)
from app.db.session import get_session
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdateMe, UserStatusUpdate
from app.services.user_service import (
    create_user as svc_create_user,
    get_user_me as svc_get_user_me,
    list_users_by_tenant as svc_list_users_by_tenant,
    delete_user as svc_delete_user,
    update_user_status as svc_update_user_status,
    update_user_me as svc_update_user_me,
    update_user_avatar as svc_update_user_avatar,
)


router = APIRouter()


@router.get(
    "/me",
    response_model=UserRead,
    summary="Información del usuario autenticado",
)
def get_me(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserRead:
    """
    Devuelve la información básica del usuario autenticado.
    """

    return svc_get_user_me(session=session, current_user=current_user)


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Actualizar perfil del usuario autenticado",
)
def update_me(
    payload: UserUpdateMe,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserRead:
    """
    Permite al usuario autenticado actualizar sus datos básicos de perfil.
    """

    return svc_update_user_me(
        session=session,
        current_user=current_user,
        data=payload,
    )


@router.post(
    "/me/avatar",
    response_model=UserRead,
    summary="Subir foto de perfil",
)
def upload_my_avatar(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserRead:
    """
    Permite al usuario autenticado subir su foto de perfil.
    """

    try:
        return svc_update_user_avatar(
            session=session,
            current_user=current_user,
            upload=file,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/by-tenant/{tenant_id}",
    response_model=List[UserRead],
    summary="Listar usuarios de un tenant",
)
def list_users_by_tenant(
    tenant_id: int,
    exclude_assigned: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:read"])),
) -> list[UserRead]:
    """
    Lista usuarios de un tenant concreto.
    """

    try:
        return svc_list_users_by_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            exclude_assigned=exclude_assigned,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear usuario (global o por tenant)",
)
def create_user(
    payload: UserCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:create"])),
) -> UserRead:
    """
    Crea un nuevo usuario global o asociado a un tenant.
    """

    try:
        return svc_create_user(
            session=session,
            current_user=current_user,
            user_in=payload,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar usuario",
)
def delete_user_endpoint(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:delete"])),
) -> None:
    """
    Elimina un usuario. No permite borrar al Super Admin global.
    """

    try:
        return svc_delete_user(
            session=session,
            current_user=current_user,
            user_id=user_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{user_id}/status",
    response_model=UserRead,
    summary="Activar o desactivar usuario",
)
def update_user_status_endpoint(
    user_id: int,
    payload: UserStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:delete"])),
) -> UserRead:
    """
    Actualiza el estado de activación de un usuario.
    """

    try:
        return svc_update_user_status(
            session=session,
            current_user=current_user,
            user_id=user_id,
            data=payload,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
