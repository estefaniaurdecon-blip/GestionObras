from datetime import datetime
from app.core.datetime import utc_now
from typing import List, Optional

from sqlmodel import Session, select

from app.core.audit import log_action
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.ticket import Ticket, TicketPriority, TicketStatus
from app.models.notification import NotificationType
from app.models.ticket_message import TicketMessage
from app.models.ticket_participant import TicketParticipant
from app.models.user import User
from app.policies.access_policies import can_user_manage_target_user
from app.schemas.ticket import (
    TicketCreate,
    TicketMessageCreate,
    TicketMessageRead,
    TicketRead,
    TicketUpdate,
)
from app.services.notification_service import create_notification


def _user_has_permission(session: Session, user: User, code: str) -> bool:
    """
    Comprueba si un usuario tiene un permiso concreto.

    Super Admin siempre devuelve True.
    """

    if user.is_super_admin:
        return True

    if not user.role_id:
        return False

    statement = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == user.role_id)
    )
    permissions = {row[0] for row in session.exec(statement).all()}
    return code in permissions


def _get_ticket_agent_user_ids(
    session: Session,
    tenant_id: int,
    actor: User | None = None,
) -> set[int]:
    tenant_users = session.exec(
        select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True))
    ).all()
    superadmins = session.exec(
        select(User).where(User.is_super_admin.is_(True), User.is_active.is_(True))
    ).all()
    agent_ids = {user.id for user in superadmins if user.id is not None}
    for user in tenant_users:
        if user.id is None or not _user_has_permission(session, user, "tickets:manage"):
            continue
        if actor is not None and not actor.is_super_admin:
            if not can_user_manage_target_user(
                session,
                actor,
                user,
                operation="ticket_assignment",
            ):
                continue
        agent_ids.add(user.id)
    return agent_ids


def _get_ticket_participant_ids(session: Session, ticket_id: int) -> set[int]:
    statement = select(TicketParticipant.user_id).where(
        TicketParticipant.ticket_id == ticket_id,
    )
    return {row for row in session.exec(statement).all()}


def _notify_ticket_users(
    session: Session,
    *,
    ticket: Ticket,
    actor_id: int,
    notification_type: NotificationType,
    title: str,
    body: Optional[str] = None,
    only_agents: bool = False,
    extra_user_ids: Optional[set[int]] = None,
) -> None:
    recipient_ids = _get_ticket_participant_ids(session, ticket.id)
    recipient_ids.add(ticket.created_by_id)
    if ticket.assigned_to_id:
        recipient_ids.add(ticket.assigned_to_id)
    if extra_user_ids:
        recipient_ids.update(extra_user_ids)
    recipient_ids.discard(actor_id)
    if not recipient_ids:
        return

    if only_agents:
        users = session.exec(select(User).where(User.id.in_(recipient_ids))).all()
        recipient_ids = {
            user.id
            for user in users
            if user.is_super_admin or _user_has_permission(session, user, "tickets:manage")
        }
        if not recipient_ids:
            return

    reference = f"ticket_id={ticket.id}"
    for user_id in recipient_ids:
        create_notification(
            session,
            tenant_id=ticket.tenant_id,
            user_id=user_id,
            type=notification_type,
            title=title,
            body=body,
            reference=reference,
        )

def _touch_activity(ticket: Ticket) -> None:
    """
    Actualiza los campos de actividad del ticket.
    """

    now = utc_now()
    ticket.last_activity_at = now
    ticket.updated_at = now


def _ticket_to_read(session: Session, ticket: Ticket) -> TicketRead:
    """
    Convierte un modelo Ticket a esquema TicketRead, resolviendo emails.
    """

    created_by = session.get(User, ticket.created_by_id)
    assigned_to = (
        session.get(User, ticket.assigned_to_id) if ticket.assigned_to_id else None
    )

    return TicketRead(
        id=ticket.id,
        tenant_id=ticket.tenant_id,
        subject=ticket.subject,
        status=ticket.status,
        priority=ticket.priority,
        tool_slug=ticket.tool_slug,
        category=ticket.category,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        last_activity_at=ticket.last_activity_at,
        first_response_at=ticket.first_response_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        has_attachments=ticket.has_attachments,
        created_by_email=created_by.email if created_by else "",
        assigned_to_email=assigned_to.email if assigned_to else None,
    )


def _message_to_read(session: Session, message: TicketMessage) -> TicketMessageRead:
    """
    Convierte un modelo TicketMessage a esquema TicketMessageRead.
    """

    author = session.get(User, message.author_id)

    return TicketMessageRead(
        id=message.id,
        author_email=author.email if author else "",
        body=message.body,
        is_internal=message.is_internal,
        created_at=message.created_at,
    )


def _ensure_visibility_for_user(
    session: Session,
    ticket: Ticket,
    user: User,
) -> None:
    """
    Valida que el usuario tiene visibilidad sobre el ticket.

    Reglas:
    - Super Admin: ve todo.
    - Usuarios con `tickets:read_tenant`: ven todos los tickets de su tenant.
    - Resto: solo tickets creados por Ã©l o en los que participa.
    """

    if user.is_super_admin:
        # Super Admin ve todos los tickets de todos los tenants.
        return

    if not user.tenant_id or user.tenant_id != ticket.tenant_id:
        raise PermissionError("El usuario no pertenece al tenant del ticket")

    # Agentes con permisos de gestiÃ³n ven siempre todos los tickets del tenant.
    if _user_has_permission(session, user, "tickets:manage"):
        return

    # Usuarios con permiso de lectura a nivel de tenant (ej. tenant_admin)
    # tambiÃ©n ven todos los tickets del tenant.
    if _user_has_permission(session, user, "tickets:read_tenant"):
        return

    if ticket.created_by_id == user.id:
        return

    participant = session.get(TicketParticipant, (ticket.id, user.id))
    if participant:
        return

    raise PermissionError("El usuario no tiene acceso a este ticket")


def _get_ticket_for_manage(
    session: Session,
    current_user: User,
    ticket_id: int,
) -> Ticket:
    """
    Recupera un ticket y valida que el usuario puede gestionarlo (tickets:manage).
    """

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise ValueError("Ticket no encontrado")

    if current_user.is_super_admin:
        return ticket

    if not current_user.tenant_id or current_user.tenant_id != ticket.tenant_id:
        raise PermissionError("El usuario no puede gestionar este ticket")

    # A estas alturas, el endpoint ya ha validado el permiso `tickets:manage`
    # mediante `require_permissions`. AquÃ­ solo comprobamos pertenencia al tenant.
    return ticket


def create_ticket(
    session: Session,
    current_user: User,
    data: TicketCreate,
) -> TicketRead:
    """
    Crea un nuevo ticket de soporte asociado al tenant del usuario.
    """

    if not current_user.tenant_id and not current_user.is_super_admin:
        raise PermissionError("El usuario debe estar asociado a un tenant")

    tenant_id = current_user.tenant_id if not current_user.is_super_admin else None
    if tenant_id is None:
        raise PermissionError("El Super Admin debe actuar dentro de un tenant concreto")

    now = utc_now()
    ticket = Ticket(
        tenant_id=tenant_id,
        created_by_id=current_user.id,
        subject=data.subject,
        description=data.description,
        priority=TicketPriority.MEDIUM,
        tool_slug=data.tool_slug,
        category=data.category,
        created_at=now,
        updated_at=now,
        last_activity_at=now,
    )
    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    # El creador siempre es participante activo.
    participant = TicketParticipant(
        ticket_id=ticket.id,
        user_id=current_user.id,
        is_watcher=False,
    )
    session.add(participant)
    session.commit()

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=ticket.tenant_id,
        action="ticket.create",
        details=f"ticket_id={ticket.id}, subject={ticket.subject}",
    )

    agent_ids = _get_ticket_agent_user_ids(session, ticket.tenant_id, actor=current_user)
    _notify_ticket_users(
        session,
        ticket=ticket,
        actor_id=current_user.id,
        notification_type=NotificationType.TICKET_STATUS,
        title="Ticket creado",
        body=ticket.subject,
        only_agents=True,
        extra_user_ids=agent_ids,
    )

    return _ticket_to_read(session, ticket)


def list_tickets(
    session: Session,
    current_user: User,
    *,
    tenant_id: Optional[int] = None,
    status: Optional[TicketStatus] = None,
    priority: Optional[TicketPriority] = None,
    tool_slug: Optional[str] = None,
    mine_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> List[TicketRead]:
    """
    Lista tickets visibles para el usuario, con paginaciÃ³n y filtros.
    """

    statement = select(Ticket)

    if current_user.is_super_admin:
        # Super Admin: puede listar todos o filtrar por tenant concreto.
        if tenant_id is not None:
            statement = statement.where(Ticket.tenant_id == tenant_id)
    else:
        if not current_user.tenant_id:
            raise PermissionError("Usuario sin tenant")
        statement = statement.where(Ticket.tenant_id == current_user.tenant_id)

        if not _user_has_permission(session, current_user, "tickets:read_tenant"):
            # Solo sus propios tickets o en los que participa.
            statement = statement.where(
                (Ticket.created_by_id == current_user.id)
                | Ticket.id.in_(
                    select(TicketParticipant.ticket_id).where(
                        TicketParticipant.user_id == current_user.id,
                    ),
                ),
            )

    if mine_only:
        statement = statement.where(Ticket.created_by_id == current_user.id)

    if status is not None:
        statement = statement.where(Ticket.status == status)
    if priority is not None:
        statement = statement.where(Ticket.priority == priority)
    if tool_slug is not None:
        statement = statement.where(Ticket.tool_slug == tool_slug)

    statement = (
        statement.order_by(Ticket.last_activity_at.desc())
        .offset(offset)
        .limit(limit)
    )

    tickets = session.exec(statement).all()
    return [_ticket_to_read(session, t) for t in tickets]


def get_ticket(
    session: Session,
    current_user: User,
    ticket_id: int,
) -> TicketRead:
    """
    Recupera un ticket, respetando reglas de visibilidad.
    """

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise ValueError("Ticket no encontrado")

    _ensure_visibility_for_user(session, ticket, current_user)
    return _ticket_to_read(session, ticket)


def list_messages(
    session: Session,
    current_user: User,
    ticket_id: int,
) -> List[TicketMessageRead]:
    """
    Lista mensajes de un ticket, aplicando visibilidad para notas internas.
    """

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise ValueError("Ticket no encontrado")

    _ensure_visibility_for_user(session, ticket, current_user)

    is_agent = current_user.is_super_admin or _user_has_permission(
        session,
        current_user,
        "tickets:manage",
    )

    statement = select(TicketMessage).where(TicketMessage.ticket_id == ticket.id)
    if not is_agent:
        statement = statement.where(TicketMessage.is_internal.is_(False))

    messages = session.exec(statement.order_by(TicketMessage.created_at.asc())).all()
    return [_message_to_read(session, m) for m in messages]


def add_message(
    session: Session,
    current_user: User,
    ticket_id: int,
    data: TicketMessageCreate,
) -> TicketMessageRead:
    """
    AÃ±ade un mensaje a un ticket.

    Si el mensaje es interno, solo se permite a usuarios con permisos de gestiÃ³n.
    """

    ticket = session.get(Ticket, ticket_id)
    if not ticket:
        raise ValueError("Ticket no encontrado")

    _ensure_visibility_for_user(session, ticket, current_user)

    is_agent = current_user.is_super_admin or _user_has_permission(
        session,
        current_user,
        "tickets:manage",
    )
    if data.is_internal and not is_agent:
        raise PermissionError("No tienes permisos para crear notas internas")

    message = TicketMessage(
        ticket_id=ticket.id,
        author_id=current_user.id,
        body=data.body,
        is_internal=data.is_internal,
    )
    session.add(message)

    _touch_activity(ticket)

    if (
        is_agent
        and ticket.first_response_at is None
        and current_user.id != ticket.created_by_id
    ):
        ticket.first_response_at = message.created_at

    # El autor pasa a ser participante si no lo era.
    participant = session.get(TicketParticipant, (ticket.id, current_user.id))
    if not participant:
        session.add(
            TicketParticipant(
                ticket_id=ticket.id,
                user_id=current_user.id,
                is_watcher=False,
            ),
        )

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=ticket.tenant_id,
        action="ticket.comment_internal" if data.is_internal else "ticket.comment",
        details=f"ticket_id={ticket.id}",
    )

    session.commit()
    session.refresh(message)
    session.refresh(ticket)

    agent_ids = _get_ticket_agent_user_ids(session, ticket.tenant_id, actor=current_user)
    _notify_ticket_users(
        session,
        ticket=ticket,
        actor_id=current_user.id,
        notification_type=NotificationType.TICKET_COMMENT,
        title="Nuevo comentario en ticket",
        body=ticket.subject,
        only_agents=data.is_internal,
        extra_user_ids=agent_ids,
    )

    return _message_to_read(session, message)


def update_ticket(
    session: Session,
    current_user: User,
    ticket_id: int,
    data: TicketUpdate,
) -> TicketRead:
    """
    ActualizaciÃ³n genÃ©rica de ticket (status, prioridad, asignaciÃ³n).
    """

    ticket = _get_ticket_for_manage(session, current_user, ticket_id)

    status_changed = data.status is not None and data.status != ticket.status
    priority_changed = (
        data.priority is not None and data.priority != ticket.priority
    )
    assignee_changed = (
        data.assigned_to_id is not None
        and data.assigned_to_id != ticket.assigned_to_id
    )

    if data.status is not None:
        ticket.status = data.status
    if data.priority is not None:
        ticket.priority = data.priority
    if data.assigned_to_id is not None:
        ticket.assigned_to_id = data.assigned_to_id

    _touch_activity(ticket)

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=ticket.tenant_id,
        action="ticket.update",
        details=f"ticket_id={ticket.id}",
    )

    if assignee_changed and ticket.assigned_to_id:
        _notify_ticket_users(
            session,
            ticket=ticket,
            actor_id=current_user.id,
            notification_type=NotificationType.TICKET_ASSIGNED,
            title="Ticket asignado",
            body=ticket.subject,
            extra_user_ids={ticket.assigned_to_id},
        )
    if status_changed or priority_changed:
        _notify_ticket_users(
            session,
            ticket=ticket,
            actor_id=current_user.id,
            notification_type=NotificationType.TICKET_STATUS,
            title="ActualizaciÃ³n de ticket",
            body=ticket.subject,
        )

    return _ticket_to_read(session, ticket)


def close_ticket(
    session: Session,
    current_user: User,
    ticket_id: int,
) -> TicketRead:
    """
    Marca un ticket como cerrado. TambiÃ©n rellena `resolved_at` si no estaba.
    """

    ticket = _get_ticket_for_manage(session, current_user, ticket_id)

    if ticket.status == TicketStatus.CLOSED:
        return _ticket_to_read(session, ticket)

    now = utc_now()
    ticket.status = TicketStatus.CLOSED
    ticket.closed_at = now
    if ticket.resolved_at is None:
        ticket.resolved_at = now

    _touch_activity(ticket)

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=ticket.tenant_id,
        action="ticket.close",
        details=f"ticket_id={ticket.id}",
    )

    _notify_ticket_users(
        session,
        ticket=ticket,
        actor_id=current_user.id,
        notification_type=NotificationType.TICKET_STATUS,
        title="Ticket cerrado",
        body=ticket.subject,
    )

    return _ticket_to_read(session, ticket)


def reopen_ticket(
    session: Session,
    current_user: User,
    ticket_id: int,
) -> TicketRead:
    """
    Reabre un ticket cerrado o resuelto, dejÃ¡ndolo en estado IN_PROGRESS.
    """

    ticket = _get_ticket_for_manage(session, current_user, ticket_id)

    if ticket.status not in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
        return _ticket_to_read(session, ticket)

    ticket.status = TicketStatus.IN_PROGRESS
    ticket.closed_at = None

    _touch_activity(ticket)

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=ticket.tenant_id,
        action="ticket.reopen",
        details=f"ticket_id={ticket.id}",
    )

    _notify_ticket_users(
        session,
        ticket=ticket,
        actor_id=current_user.id,
        notification_type=NotificationType.TICKET_STATUS,
        title="Ticket reabierto",
        body=ticket.subject,
    )

    return _ticket_to_read(session, ticket)


def assign_ticket(
    session: Session,
    current_user: User,
    ticket_id: int,
    assignee_id: int,
) -> TicketRead:
    """
    Asigna un ticket a un usuario concreto del tenant.
    """

    ticket = _get_ticket_for_manage(session, current_user, ticket_id)

    if ticket.assigned_to_id == assignee_id:
        return _ticket_to_read(session, ticket)

    ticket.assigned_to_id = assignee_id
    _touch_activity(ticket)

    # El asignado pasa a ser participante.
    participant = session.get(TicketParticipant, (ticket.id, assignee_id))
    if not participant:
        session.add(
            TicketParticipant(
                ticket_id=ticket.id,
                user_id=assignee_id,
                is_watcher=False,
            ),
        )

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=ticket.tenant_id,
        action="ticket.assign",
        details=f"ticket_id={ticket.id}, assigned_to_id={assignee_id}",
    )

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    _notify_ticket_users(
        session,
        ticket=ticket,
        actor_id=current_user.id,
        notification_type=NotificationType.TICKET_ASSIGNED,
        title="Ticket asignado",
        body=ticket.subject,
        extra_user_ids={assignee_id},
    )

    return _ticket_to_read(session, ticket)
