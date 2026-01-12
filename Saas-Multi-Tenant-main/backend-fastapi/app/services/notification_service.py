from datetime import datetime
from typing import Iterable, Optional

from sqlmodel import Session, select

from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationRead


def create_notification(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    type: NotificationType,
    title: str,
    body: str | None = None,
    reference: str | None = None,
) -> Notification:
    notification = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        reference=reference,
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification


def list_notifications_for_user(
    session: Session,
    *,
    user: User,
    only_unread: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> NotificationListResponse:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
    )
    if only_unread:
        stmt = stmt.where(Notification.is_read.is_(False))

    # Obtenemos el total de notificaciones para el usuario.
    total_result = session.exec(
        select(Notification).where(Notification.user_id == user.id),
    ).all()
    total = len(total_result)

    notifications: Iterable[Notification] = session.exec(
        stmt.offset(offset).limit(limit),
    ).all()

    items = [
        NotificationRead(
            id=n.id,
            tenant_id=n.tenant_id,
            user_id=n.user_id,
            type=n.type,
            title=n.title,
            body=n.body,
            reference=n.reference,
            is_read=n.is_read,
            created_at=n.created_at,
            read_at=n.read_at,
        )
        for n in notifications
    ]
    return NotificationListResponse(items=items, total=total)


def mark_notification_as_read(
    session: Session,
    *,
    user: User,
    notification_id: int,
) -> NotificationRead:
    notification = session.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise ValueError("Notificación no encontrada")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        session.add(notification)
        session.commit()
        session.refresh(notification)

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


def mark_all_as_read(session: Session, *, user: User) -> None:
    stmt = select(Notification).where(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    )
    for n in session.exec(stmt).all():
        n.is_read = True
        n.read_at = datetime.utcnow()
        session.add(n)
    session.commit()
