from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.notification import NotificationType
from app.schemas.notification import NotificationListResponse, NotificationRead
from app.services.notification_service import (
    create_notification,
    delete_notification,
    list_notifications_for_user,
    mark_all_as_read,
    mark_notification_as_read,
)


class NotificationCreate(BaseModel):
    user_id: int
    type: NotificationType = NotificationType.GENERIC
    title: str
    body: Optional[str] = None
    reference: Optional[str] = None


router = APIRouter()


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="Listar notificaciones del usuario actual",
)
def api_list_notifications(
    only_unread: bool = Query(
        default=False,
        description="Si es true, solo devuelve notificaciones no leídas.",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationListResponse:
    return list_notifications_for_user(
        session=session,
        user=current_user,
        only_unread=only_unread,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/{notification_id}/read",
    response_model=NotificationRead,
    summary="Marcar una notificación como leída",
)
def api_mark_notification_read(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationRead:
    try:
        return mark_notification_as_read(
            session=session,
            user=current_user,
            notification_id=notification_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marcar todas las notificaciones como leídas",
)
def api_mark_all_read(
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> None:
    mark_all_as_read(session=session, user=current_user)


@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una notificación del usuario actual",
)
def api_delete_notification(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> None:
    try:
        delete_notification(
            session=session,
            user=current_user,
            notification_id=notification_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "",
    response_model=NotificationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear notificación para un usuario del tenant",
)
def api_create_notification(
    payload: NotificationCreate,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationRead:
    if current_user.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant requerido.")
    notification = create_notification(
        session,
        tenant_id=int(current_user.tenant_id),
        user_id=payload.user_id,
        type=payload.type,
        title=payload.title,
        body=payload.body,
        reference=payload.reference,
    )
    return NotificationRead(
        id=notification.id,
        tenant_id=notification.tenant_id,
        user_id=notification.user_id,
        type=notification.type,
        title=notification.title,
        body=notification.body,
        reference=notification.reference,
        is_read=notification.is_read,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )

