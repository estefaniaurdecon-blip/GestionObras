from __future__ import annotations

from typing import Iterable

from sqlalchemy import or_
from sqlmodel import Session, select

from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageCreate, MessageListResponse, MessageRead, MessageUserRead


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
        .offset(offset)
        .limit(limit)
    ).all()

    total = len(
        session.exec(
            select(Message).where(
                Message.tenant_id == tenant_id,
                visibility_filter,
            )
        ).all()
    )

    return MessageListResponse(
        items=[_serialize_message(session, row) for row in rows],
        total=total,
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

    if to_user_id.isdigit():
        target_user = session.get(User, int(to_user_id))
        if not target_user:
            raise MessageValidationError("Destinatario no encontrado.")
        if target_user.tenant_id != tenant_id:
            raise MessageValidationError("Destinatario fuera del tenant.")

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
    return _serialize_message(session, row)


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
