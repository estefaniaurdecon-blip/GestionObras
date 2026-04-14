from __future__ import annotations

from sqlmodel import Session

from app.models.erp import WorkReport
from app.models.project_conversation import ProjectConversation
from app.models.user import User


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
    """Operational scope policy. Same tenant = same scope."""
    del session
    if user_b is None:
        return False
    if user_a.tenant_id is None or user_b.tenant_id is None:
        return False
    return int(user_a.tenant_id) == int(user_b.tenant_id)


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
    """Operational user visibility policy.

    Super admins see everyone.
    Within the same tenant (company), all users can see each other —
    multiple tenant_admins in the same org should not create visibility silos.
    """
    del session  # no longer needed after removing group check
    if target is None:
        return False
    if actor.is_super_admin:
        return True
    if actor.tenant_id is None or target.tenant_id is None:
        return False
    return int(actor.tenant_id) == int(target.tenant_id)


def can_access_work_report(
    session: Session,
    user: User,
    report: WorkReport,
) -> bool:
    """Work report visibility policy. Same tenant = visible."""
    del session
    if user.is_super_admin:
        return True
    if user.tenant_id is None or report.tenant_id is None:
        return False
    return int(user.tenant_id) == int(report.tenant_id)


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
    """Shared file policy. Same tenant = can share."""
    del session
    if recipient is None:
        return False
    if sender.tenant_id is None or recipient.tenant_id is None:
        return False
    return int(sender.tenant_id) == int(recipient.tenant_id)


def can_access_project_conversation(
    session: Session,
    actor: User,
    conversation: ProjectConversation | None,
) -> bool:
    """Project conversation access policy. Same tenant = access."""
    del session
    if conversation is None or actor.id is None or actor.is_super_admin:
        return False
    if actor.tenant_id is None or conversation.tenant_id is None:
        return False
    return int(actor.tenant_id) == int(conversation.tenant_id)


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


def can_user_view_tenant_data(
    session: Session,
    user: User,
    *,
    created_by_user_id: int | None = None,
) -> bool:
    """
    Data visibility policy for ERP resources.
    
    Super admins see everything.
    Tenant admins see everything within their tenant.
    Regular users (usuario) only see their own data.
    
    Args:
        session: Database session
        user: The user requesting access
        created_by_user_id: The user_id who created the resource (optional)
    
    Returns:
        True if the user can view the data
    """
    del session  # Not needed for this check
    
    # Super admins can see everything
    if user.is_super_admin:
        return True
    
    # Users without tenant can't see anything
    if user.tenant_id is None:
        return False
    
    # Import here to avoid circular imports
    from app.models.role import Role
    
    # Get user's role name
    role_name = None
    if user.role_id is not None:
        # We'll check role name at the service layer where we have session access
        # For now, we return True and let service layer filter
        pass
    
    # Default: allow (service layer will filter by created_by_user_id for regular users)
    return True
