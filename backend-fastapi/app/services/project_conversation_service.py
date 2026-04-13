from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now

from sqlmodel import Session, select

from app.models.erp import Project
from app.models.project_conversation import (
    ProjectConversation,
    ProjectConversationMessage,
    ProjectConversationParticipant,
)
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.policies.access_policies import (
    can_access_project_conversation,
    can_send_project_conversation_message,
    can_user_view_target_user,
    can_view_project_conversation_participants,
)
from app.schemas.project_conversation import (
    ProjectConversationMessageCreate,
    ProjectConversationMessageListRead,
    ProjectConversationMessageRead,
    ProjectConversationMessageUserRead,
    ProjectConversationParticipantRead,
    ProjectConversationRead,
    ProjectConversationShellRead,
)
from app.services.user_service import resolve_creator_group_id


class ProjectConversationValidationError(ValueError):
    pass


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
    if project is None:
        raise ProjectConversationValidationError("Obra no encontrada.")
    return project


def _actor_group_or_error(session: Session, actor: User, *, tenant_id: int) -> int:
    if actor.is_super_admin:
        raise ProjectConversationValidationError("super_admin fuera del circuito operativo normal.")
    if actor.tenant_id != tenant_id:
        raise ProjectConversationValidationError("No autorizado para ese tenant.")
    actor_group_id = resolve_creator_group_id(session, actor, persist=True)
    if actor_group_id is None:
        raise ProjectConversationValidationError("Grupo operativo no resuelto.")
    return int(actor_group_id)


def _load_assigned_users(
    session: Session,
    *,
    tenant_id: int,
    project_id: int,
) -> list[User]:
    return session.exec(
        select(User)
        .join(UserWorkAssignment, UserWorkAssignment.user_id == User.id)
        .where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.project_id == project_id,
            User.tenant_id == tenant_id,
            User.is_super_admin.is_(False),
        )
        .order_by(User.full_name.asc(), User.id.asc())
    ).all()


def _visible_scope_users(
    session: Session,
    *,
    actor: User,
    tenant_id: int,
    project_id: int,
) -> list[User]:
    assigned_users = _load_assigned_users(
        session,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    visible_users_by_id: dict[int, User] = {}
    for candidate in assigned_users:
        if candidate.id is None:
            continue
        if not can_user_view_target_user(session, actor, candidate):
            continue
        visible_users_by_id.setdefault(int(candidate.id), candidate)
    return list(visible_users_by_id.values())


def _reconcile_participants(
    session: Session,
    *,
    conversation: ProjectConversation,
    visible_users: list[User],
) -> None:
    existing_rows = session.exec(
        select(ProjectConversationParticipant).where(
            ProjectConversationParticipant.conversation_id == int(conversation.id or 0),
        )
    ).all()
    existing_by_user_id = {
        int(row.user_id): row
        for row in existing_rows
    }
    visible_user_ids = {
        int(user.id)
        for user in visible_users
        if user.id is not None
    }
    now = utc_now()

    for user in visible_users:
        if user.id is None:
            continue
        user_id = int(user.id)
        participant = existing_by_user_id.get(user_id)
        if participant is None:
            session.add(
                ProjectConversationParticipant(
                    conversation_id=int(conversation.id or 0),
                    user_id=user_id,
                    tenant_id=conversation.tenant_id,
                    project_id=conversation.project_id,
                    creator_group_id=conversation.creator_group_id,
                    is_active=True,
                    joined_at=now,
                    left_at=None,
                    last_read_at=None,
                )
            )
            continue

        if not participant.is_active or participant.left_at is not None:
            participant.is_active = True
            participant.left_at = None
            participant.joined_at = now
            session.add(participant)

    for participant in existing_rows:
        if int(participant.user_id) in visible_user_ids:
            continue
        if not participant.is_active and participant.left_at is not None:
            continue
        participant.is_active = False
        participant.left_at = participant.left_at or now
        session.add(participant)


def _serialize_shell(
    session: Session,
    *,
    actor: User,
    conversation: ProjectConversation,
    created_now: bool,
) -> ProjectConversationShellRead:
    participant_rows = session.exec(
        select(ProjectConversationParticipant, User)
        .join(User, User.id == ProjectConversationParticipant.user_id)
        .where(
            ProjectConversationParticipant.conversation_id == int(conversation.id or 0),
            ProjectConversationParticipant.is_active.is_(True),
            User.is_super_admin.is_(False),
            User.tenant_id == conversation.tenant_id,
        )
        .order_by(ProjectConversationParticipant.joined_at.asc(), User.full_name.asc())
    ).all()

    participants: list[ProjectConversationParticipantRead] = []
    if can_view_project_conversation_participants(session, actor, conversation):
        seen_user_ids: set[int] = set()
        for participant, user in participant_rows:
            if user.id is None:
                continue
            user_id = int(user.id)
            if user_id in seen_user_ids:
                continue
            seen_user_ids.add(user_id)
            participants.append(
                ProjectConversationParticipantRead(
                    user_id=user_id,
                    full_name=user.full_name,
                    email=user.email,
                    joined_at=participant.joined_at,
                    is_active=participant.is_active,
                )
            )

    return ProjectConversationShellRead(
        conversation=ProjectConversationRead(
            id=int(conversation.id or 0),
            tenant_id=conversation.tenant_id,
            project_id=conversation.project_id,
            creator_group_id=conversation.creator_group_id,
            created_by_id=conversation.created_by_id,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            last_message_at=conversation.last_message_at,
        ),
        participants=participants,
        created_now=created_now,
    )


def _serialize_conversation(conversation: ProjectConversation) -> ProjectConversationRead:
    return ProjectConversationRead(
        id=int(conversation.id or 0),
        tenant_id=conversation.tenant_id,
        project_id=conversation.project_id,
        creator_group_id=conversation.creator_group_id,
        created_by_id=conversation.created_by_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
    )


def _serialize_message(
    session: Session,
    row: ProjectConversationMessage,
) -> ProjectConversationMessageRead:
    sender = session.get(User, int(row.from_user_id))
    return ProjectConversationMessageRead(
        id=int(row.id or 0),
        conversation_id=row.conversation_id,
        tenant_id=row.tenant_id,
        project_id=row.project_id,
        creator_group_id=row.creator_group_id,
        from_user_id=row.from_user_id,
        message=row.message,
        created_at=row.created_at,
        from_user=(
            ProjectConversationMessageUserRead(full_name=sender.full_name)
            if sender is not None
            else None
        ),
    )


def _active_participant_or_error(
    session: Session,
    *,
    conversation: ProjectConversation,
    actor: User,
) -> ProjectConversationParticipant:
    actor_id = int(actor.id or 0)
    participant = session.exec(
        select(ProjectConversationParticipant).where(
            ProjectConversationParticipant.conversation_id == int(conversation.id or 0),
            ProjectConversationParticipant.user_id == actor_id,
        )
    ).first()
    if participant is None or not participant.is_active:
        raise ProjectConversationValidationError(
            "No eres participante activo de esta conversaciÃ³n de obra."
        )
    return participant


def _resolve_conversation_context(
    session: Session,
    *,
    actor: User,
    tenant_id: int,
    project_id: int,
) -> tuple[ProjectConversation, ProjectConversationParticipant]:
    shell = get_or_create_project_conversation_shell(
        session,
        actor=actor,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    conversation = session.get(ProjectConversation, shell.conversation.id)
    if conversation is None:
        raise ProjectConversationValidationError("ConversaciÃ³n de obra no encontrada.")
    participant = _active_participant_or_error(
        session,
        conversation=conversation,
        actor=actor,
    )
    return conversation, participant


def get_or_create_project_conversation_shell(
    session: Session,
    *,
    actor: User,
    tenant_id: int,
    project_id: int,
) -> ProjectConversationShellRead:
    _project_or_error(session, tenant_id=tenant_id, project_id=project_id)

    # Validate actor belongs to tenant
    if actor.is_super_admin:
        raise ProjectConversationValidationError("super_admin fuera del circuito operativo normal.")
    if actor.tenant_id != tenant_id:
        raise ProjectConversationValidationError("No autorizado para ese tenant.")

    visible_users = _visible_scope_users(
        session,
        actor=actor,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    actor_id = int(actor.id or 0)
    if actor_id == 0 or actor_id not in {int(user.id or 0) for user in visible_users}:
        raise ProjectConversationValidationError("No tienes acceso operativo a esta obra.")

    # Look up conversation by tenant + project (one conversation per obra per tenant)
    conversation = session.exec(
        select(ProjectConversation).where(
            ProjectConversation.tenant_id == tenant_id,
            ProjectConversation.project_id == project_id,
        )
    ).first()

    created_now = False
    if conversation is None:
        # creator_group_id is still stored for backwards compat but no longer used for filtering
        actor_group_id = resolve_creator_group_id(session, actor, persist=True) or actor_id
        conversation = ProjectConversation(
            tenant_id=tenant_id,
            project_id=project_id,
            creator_group_id=actor_group_id,
            created_by_id=actor_id,
        )
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        created_now = True

    if not can_access_project_conversation(session, actor, conversation):
        raise ProjectConversationValidationError("No tienes acceso a esta conversaciÃ³n de obra.")

    _reconcile_participants(
        session,
        conversation=conversation,
        visible_users=visible_users,
    )
    session.commit()
    session.refresh(conversation)

    return _serialize_shell(
        session,
        actor=actor,
        conversation=conversation,
        created_now=created_now,
    )


def list_project_conversation_messages(
    session: Session,
    *,
    actor: User,
    tenant_id: int,
    project_id: int,
) -> ProjectConversationMessageListRead:
    conversation, participant = _resolve_conversation_context(
        session,
        actor=actor,
        tenant_id=tenant_id,
        project_id=project_id,
    )

    rows = session.exec(
        select(ProjectConversationMessage)
        .where(
            ProjectConversationMessage.conversation_id == int(conversation.id or 0),
            ProjectConversationMessage.created_at >= participant.joined_at,
        )
        .order_by(
            ProjectConversationMessage.created_at.asc(),
            ProjectConversationMessage.id.asc(),
        )
    ).all()

    return ProjectConversationMessageListRead(
        conversation=_serialize_conversation(conversation),
        items=[_serialize_message(session, row) for row in rows],
    )


def create_project_conversation_message(
    session: Session,
    *,
    actor: User,
    tenant_id: int,
    project_id: int,
    payload: ProjectConversationMessageCreate,
) -> ProjectConversationMessageRead:
    body = (payload.message or "").strip()
    if not body:
        raise ProjectConversationValidationError("message es obligatorio.")

    conversation, participant = _resolve_conversation_context(
        session,
        actor=actor,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    if not can_send_project_conversation_message(session, actor, conversation):
        raise ProjectConversationValidationError(
            "No puedes enviar mensajes en esta conversaciÃ³n de obra."
        )
    if not participant.is_active:
        raise ProjectConversationValidationError(
            "No eres participante activo de esta conversaciÃ³n de obra."
        )

    now = utc_now()
    row = ProjectConversationMessage(
        conversation_id=int(conversation.id or 0),
        tenant_id=conversation.tenant_id,
        project_id=conversation.project_id,
        creator_group_id=conversation.creator_group_id,
        from_user_id=int(actor.id or 0),
        message=body,
        created_at=now,
    )
    conversation.updated_at = now
    conversation.last_message_at = now
    session.add(row)
    session.add(conversation)
    session.commit()
    session.refresh(row)
    session.refresh(conversation)
    return _serialize_message(session, row)
