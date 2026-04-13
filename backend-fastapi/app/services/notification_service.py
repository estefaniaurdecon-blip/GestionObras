from datetime import datetime
from app.core.datetime import utc_now
from typing import Iterable, Optional

from sqlalchemy import String, cast
from sqlmodel import Session, select

from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationRead


APP_CENTER_NOTIFICATION_TYPES: tuple[NotificationType, ...] = (
    NotificationType.WORK_REPORT_PENDING,
    NotificationType.WORK_REPORT_APPROVED,
    NotificationType.WORK_ASSIGNED,
    NotificationType.MACHINERY_EXPIRY_WARNING,
    NotificationType.NEW_MESSAGE,
)
APP_CENTER_NOTIFICATION_TYPE_VALUES: tuple[str, ...] = tuple(
    notification_type.value for notification_type in APP_CENTER_NOTIFICATION_TYPES
)


def _notification_type_value(notification_type: NotificationType | str) -> str:
    if isinstance(notification_type, NotificationType):
        return notification_type.value
    return str(notification_type)


def _notification_type_text():
    return cast(Notification.type, String)


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


def notification_exists(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    type: NotificationType,
    reference: str | None = None,
    since: datetime | None = None,
) -> bool:
    stmt = select(Notification).where(
        Notification.tenant_id == tenant_id,
        Notification.user_id == user_id,
        _notification_type_text() == _notification_type_value(type),
    )
    if reference is None:
        stmt = stmt.where(Notification.reference.is_(None))
    else:
        stmt = stmt.where(Notification.reference == reference)
    if since is not None:
        stmt = stmt.where(Notification.created_at >= since)

    return session.exec(stmt.limit(1)).first() is not None


def create_notification_once(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    type: NotificationType,
    title: str,
    body: str | None = None,
    reference: str | None = None,
    since: datetime | None = None,
) -> Notification:
    if notification_exists(
        session,
        tenant_id=tenant_id,
        user_id=user_id,
        type=type,
        reference=reference,
        since=since,
    ):
        existing_stmt = select(Notification).where(
            Notification.tenant_id == tenant_id,
            Notification.user_id == user_id,
            _notification_type_text() == _notification_type_value(type),
        )
        if reference is None:
            existing_stmt = existing_stmt.where(Notification.reference.is_(None))
        else:
            existing_stmt = existing_stmt.where(Notification.reference == reference)
        if since is not None:
            existing_stmt = existing_stmt.where(Notification.created_at >= since)
        existing = session.exec(
            existing_stmt.order_by(Notification.created_at.desc()).limit(1),
        ).first()
        if existing is not None:
            return existing

    return create_notification(
        session,
        tenant_id=tenant_id,
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        reference=reference,
    )


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
        .where(_notification_type_text().in_(APP_CENTER_NOTIFICATION_TYPE_VALUES))
        .order_by(Notification.created_at.desc())
    )
    if only_unread:
        stmt = stmt.where(Notification.is_read.is_(False))

    # Obtenemos el total de notificaciones para el usuario.
    total_result = session.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            _notification_type_text().in_(APP_CENTER_NOTIFICATION_TYPE_VALUES),
        ),
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
        raise ValueError("NotificaciÃ³n no encontrada")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = utc_now()
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
        n.read_at = utc_now()
        session.add(n)
    session.commit()


def delete_notification(
    session: Session,
    *,
    user: User,
    notification_id: int,
) -> None:
    notification = session.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise ValueError("NotificaciÃ³n no encontrada")

    session.delete(notification)
    session.commit()
