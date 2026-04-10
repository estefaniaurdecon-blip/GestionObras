from __future__ import annotations

from typing import Iterable

from sqlalchemy import or_
from sqlmodel import Session, select

from app.models.erp import Project
from app.models.message import Message
from app.models.notification import NotificationType
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.policies.access_policies import (
    can_users_message_each_other,
    can_users_operate_within_same_group_scope,
)
from app.schemas.message import (
    MessageCreate,
    MessageListResponse,
    MessageRead,
    MessageUserRead,
    WorkBroadcastMessageResult,
)
from app.services.notification_service import create_notification


class MessageValidationError(ValueError):
    pass


class MessageNotFoundError(ValueError):
    pass


def _resolve_user_name(session: Session, user_id: str) -> str:
    if user_id.isdigit():
        user_obj = session.get(User, int(user_id))
        if user_obj:
            return user_obj.full_name
    return user_id


def _serialize_message(session: Session, row: Message) -> MessageRead:
    return MessageRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        from_user_id=row.from_user_id,
        to_user_id=row.to_user_id,
        work_report_id=row.work_report_id,
        message=row.message,
        read=bool(row.is_read),
        created_at=row.created_at,
        from_user=MessageUserRead(full_name=_resolve_user_name(session, row.from_user_id)),
        to_user=MessageUserRead(full_name=_resolve_user_name(session, row.to_user_id)),
    )


def _current_user_id(user: User) -> str:
    return str(user.id)


def _load_numeric_user(session: Session, user_id: str) -> User | None:
    if not user_id.isdigit():
        return None
    return session.get(User, int(user_id))


def _project_or_error(
    session: Session,
    *,
    tenant_id: int,
    project_id: int,
) -> Project:
    project = session.exec(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == tenant_id,
        )
    ).first()
    if not project:
        raise MessageValidationError("Obra no encontrada.")
    return project


def _is_message_visible_to_user_group(session: Session, user: User, row: Message) -> bool:
    current_user_id = _current_user_id(user)
    other_user_id = row.to_user_id if row.from_user_id == current_user_id else row.from_user_id
    other_user = _load_numeric_user(session, other_user_id)
    return can_users_message_each_other(session, user, other_user)


def list_messages_for_user(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    limit: int = 200,
    offset: int = 0,
) -> MessageListResponse:
    current_user_id = _current_user_id(user)
    visibility_filter = or_(
        Message.from_user_id == current_user_id,
        Message.to_user_id == current_user_id,
    )

    rows: Iterable[Message] = session.exec(
        select(Message)
        .where(Message.tenant_id == tenant_id, visibility_filter)
        .order_by(Message.created_at.desc())
    ).all()

    visible_rows = [row for row in rows if _is_message_visible_to_user_group(session, user, row)]
    paged_rows = visible_rows[offset : offset + limit]

    return MessageListResponse(
        items=[_serialize_message(session, row) for row in paged_rows],
        total=len(visible_rows),
    )


def create_message(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    payload: MessageCreate,
) -> MessageRead:
    to_user_id = (payload.to_user_id or "").strip()
    body = (payload.message or "").strip()
    if not to_user_id:
        raise MessageValidationError("to_user_id es obligatorio.")
    if not body:
        raise MessageValidationError("message es obligatorio.")
    if not to_user_id.isdigit():
        raise MessageValidationError("Destinatario no valido.")
    if user.is_super_admin:
        raise MessageValidationError("super_admin fuera del circuito operativo normal.")

    target_user = session.get(User, int(to_user_id))
    if not target_user:
        raise MessageValidationError("Destinatario no encontrado.")
    if target_user.tenant_id != tenant_id:
        raise MessageValidationError("Destinatario fuera del tenant.")
    if target_user.is_super_admin:
        raise MessageValidationError("super_admin fuera del circuito operativo normal.")
    if target_user.id == user.id:
        raise MessageValidationError("No puedes enviarte mensajes a ti mismo.")
    if not can_users_message_each_other(session, user, target_user):
        raise MessageValidationError("Destinatario fuera del circuito operativo de DM.")

    row = Message(
        tenant_id=tenant_id,
        from_user_id=_current_user_id(user),
        to_user_id=to_user_id,
        work_report_id=(payload.work_report_id or "").strip() or None,
        message=body,
        is_read=False,
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    create_notification(
        session,
        tenant_id=tenant_id,
        user_id=target_user.id,
        type=NotificationType.NEW_MESSAGE,
        title=f"Nuevo mensaje de {user.full_name}",
        body=body[:240],
        reference=f"message_id={row.id}",
    )
    return _serialize_message(session, row)


def broadcast_message_to_work(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    project_id: int,
    message: str,
) -> WorkBroadcastMessageResult:
    body = (message or "").strip()
    if not body:
        raise MessageValidationError("message es obligatorio.")
    if user.is_super_admin:
        raise MessageValidationError("super_admin fuera del circuito operativo normal.")

    _project_or_error(session, tenant_id=tenant_id, project_id=project_id)

    assigned_users = session.exec(
        select(User)
        .join(UserWorkAssignment, UserWorkAssignment.user_id == User.id)
        .where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.project_id == project_id,
            User.tenant_id == tenant_id,
            User.is_super_admin.is_(False),
        )
        .order_by(User.full_name.asc())
    ).all()

    assigned_unique_by_id: dict[int, User] = {}
    for candidate in assigned_users:
        if candidate.id is None:
            continue
        assigned_unique_by_id.setdefault(int(candidate.id), candidate)

    actor_id = user.id
    eligible_users: list[User] = []
    for candidate in assigned_unique_by_id.values():
        if actor_id is not None and candidate.id == actor_id:
            continue
        if not can_users_operate_within_same_group_scope(session, user, candidate):
            continue
        eligible_users.append(candidate)

    for candidate in eligible_users:
        session.add(
            Message(
                tenant_id=tenant_id,
                from_user_id=_current_user_id(user),
                to_user_id=str(candidate.id),
                work_report_id=None,
                message=body,
                is_read=False,
            )
        )

    session.commit()

    for candidate in eligible_users:
        if candidate.id is None:
            continue
        create_notification(
            session,
            tenant_id=tenant_id,
            user_id=int(candidate.id),
            type=NotificationType.NEW_MESSAGE,
            title=f"Nuevo mensaje de {user.full_name}",
            body=body[:240],
            reference=f"project_broadcast:{project_id}:{candidate.id}",
        )

    eligible_count = len(eligible_users)
    skipped_count = len(assigned_unique_by_id) - eligible_count
    if actor_id is not None and actor_id in assigned_unique_by_id:
        skipped_count = max(skipped_count, 1)

    return WorkBroadcastMessageResult(
        project_id=project_id,
        eligible_recipient_count=eligible_count,
        sent_count=eligible_count,
        skipped_count=skipped_count,
    )


def mark_message_as_read(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    message_id: int,
) -> MessageRead:
    row = session.exec(
        select(Message).where(
            Message.id == message_id,
            Message.tenant_id == tenant_id,
        )
    ).first()
    current_user_id = _current_user_id(user)
    if not row or (row.from_user_id != current_user_id and row.to_user_id != current_user_id):
        raise MessageNotFoundError("Mensaje no encontrado.")
    if row.to_user_id != current_user_id:
        raise MessageValidationError("Solo el destinatario puede marcar el mensaje como leido.")

    if not row.is_read:
        row.is_read = True
        session.add(row)
        session.commit()
        session.refresh(row)

    return _serialize_message(session, row)


def delete_message(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    message_id: int,
) -> None:
    row = session.exec(
        select(Message).where(
            Message.id == message_id,
            Message.tenant_id == tenant_id,
        )
    ).first()
    current_user_id = _current_user_id(user)
    if not row or (row.from_user_id != current_user_id and row.to_user_id != current_user_id):
        raise MessageNotFoundError("Mensaje no encontrado.")

    session.delete(row)
    session.commit()


def delete_conversation(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    other_user_id: str,
) -> int:
    normalized_other = (other_user_id or "").strip()
    if not normalized_other:
        raise MessageValidationError("other_user_id es obligatorio.")
    if not normalized_other.isdigit():
        raise MessageValidationError("other_user_id no valido.")

    other_user = session.get(User, int(normalized_other))
    if other_user is None or other_user.tenant_id != tenant_id:
        raise MessageValidationError("Usuario no encontrado.")
    if not user.is_super_admin and not can_users_message_each_other(session, user, other_user):
        raise MessageValidationError("No puedes eliminar esta conversacion.")

    current_user_id = _current_user_id(user)
    rows = session.exec(
        select(Message).where(
            Message.tenant_id == tenant_id,
            or_(
                (
                    (Message.from_user_id == current_user_id)
                    & (Message.to_user_id == normalized_other)
                ),
                (
                    (Message.from_user_id == normalized_other)
                    & (Message.to_user_id == current_user_id)
                ),
            ),
        )
    ).all()

    for row in rows:
        session.delete(row)
    session.commit()
    return len(rows)


def clear_all_messages(
    session: Session,
    *,
    user: User,
    tenant_id: int,
) -> int:
    current_user_id = _current_user_id(user)
    rows = session.exec(
        select(Message).where(
            Message.tenant_id == tenant_id,
            or_(
                Message.from_user_id == current_user_id,
                Message.to_user_id == current_user_id,
            ),
        )
    ).all()

    for row in rows:
        session.delete(row)
    session.commit()
    return len(rows)
