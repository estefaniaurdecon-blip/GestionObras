from __future__ import annotations

from sqlmodel import Session

from app.models.erp import WorkReport
from app.models.project_conversation import ProjectConversation
from app.models.user import User
from app.services.user_service import resolve_creator_group_id, users_share_creation_group


def can_users_message_each_other(
    session: Session,
    user_a: User,
    user_b: User | None,
) -> bool:
    """Direct messaging policy. Scope: same tenant, normal users, no self-DM."""
    del session
    if user_b is None or user_a.id is None or user_b.id is None:
        return False
    if user_a.is_super_admin or user_b.is_super_admin:
        return False
    if user_a.tenant_id != user_b.tenant_id:
        return False
    return int(user_a.id) != int(user_b.id)


def can_users_operate_within_same_group_scope(
    session: Session,
    user_a: User,
    user_b: User | None,
) -> bool:
    """Operational scope policy. Today: same creator_group_id."""
    return users_share_creation_group(session, user_a, user_b)


def can_user_manage_target_user(
    session: Session,
    actor: User,
    target: User | None,
    operation: str = "any",
) -> bool:
    """User management policy. Super admins manage everyone; tenant users are group-scoped."""
    del operation
    return can_user_view_target_user(session, actor, target)


def can_user_view_target_user(
    session: Session,
    actor: User,
    target: User | None,
) -> bool:
    """Operational user visibility policy. Super admins see everyone; tenant users are group-scoped."""
    if target is None:
        return False
    if actor.is_super_admin:
        return True
    if actor.tenant_id != target.tenant_id:
        return False
    return users_share_creation_group(session, actor, target)


def can_access_work_report(
    session: Session,
    user: User,
    report: WorkReport,
) -> bool:
    """Work report visibility policy. Visibility: tenant + creator_group_id."""
    if user.is_super_admin:
        return True
    if report.tenant_id != user.tenant_id:
        return False
    if report.creator_group_id is None:
        return False
    user_group = resolve_creator_group_id(session, user, persist=True)
    return user_group == report.creator_group_id


def can_access_work_report_attachment(
    session: Session,
    user: User,
    report: WorkReport,
) -> bool:
    """Work report attachments inherit parent report access."""
    return can_access_work_report(session, user, report)


def can_share_file_with_user(
    session: Session,
    sender: User,
    recipient: User | None,
) -> bool:
    """Shared file policy. Today: same creator_group_id."""
    return users_share_creation_group(session, sender, recipient)


def can_access_project_conversation(
    session: Session,
    actor: User,
    conversation: ProjectConversation | None,
) -> bool:
    """Project conversation access policy. Scope: tenant + creator_group_id."""
    if conversation is None or actor.id is None or actor.is_super_admin:
        return False
    if actor.tenant_id != conversation.tenant_id:
        return False
    actor_group_id = resolve_creator_group_id(session, actor, persist=True)
    if actor_group_id is None:
        return False
    return int(actor_group_id) == int(conversation.creator_group_id)


def can_send_project_conversation_message(
    session: Session,
    actor: User,
    conversation: ProjectConversation | None,
) -> bool:
    """Send policy for project conversation messages. Same scope as access in v1."""
    return can_access_project_conversation(session, actor, conversation)


def can_view_project_conversation_participants(
    session: Session,
    actor: User,
    conversation: ProjectConversation | None,
) -> bool:
    """Participant list policy for project conversations. Same scope as access in v1."""
    return can_access_project_conversation(session, actor, conversation)
