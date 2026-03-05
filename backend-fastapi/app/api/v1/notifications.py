from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.schemas.notification import NotificationListResponse, NotificationRead
from app.services.notification_service import (
    delete_notification,
    list_notifications_for_user,
    mark_all_as_read,
    mark_notification_as_read,
)


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

