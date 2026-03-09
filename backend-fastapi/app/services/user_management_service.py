from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.erp import Project
from app.models.role import Role
from app.models.user import User
from app.models.user_app_role import UserAppRole
from app.models.user_work_assignment import UserWorkAssignment
from app.schemas.user_management import (
    AppRole,
    UserAssignmentsRead,
    UserProfileRead,
    UserRolesRead,
)


CORE_ROLE_TO_APP_ROLE: dict[str, AppRole] = {
    "super_admin": "master",
    "tenant_admin": "admin",
    "gerencia": "site_manager",
    "user": "foreman",
}


def _user_or_404(session: Session, *, tenant_id: int, user_id: int) -> User:
    user = session.exec(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
        )
    ).first()
    if not user:
        raise ValueError("Usuario no encontrado.")
    return user


def _project_or_404(session: Session, *, tenant_id: int, project_id: int) -> Project:
    project = session.exec(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == tenant_id,
        )
    ).first()
    if not project:
        raise ValueError("Obra no encontrada.")
    return project


def _resolve_core_role_name(session: Session, role_id: Optional[int]) -> Optional[str]:
    if role_id is None:
        return None
    role = session.get(Role, role_id)
    return role.name if role else None


def _core_role_as_app_role(session: Session, user: User) -> Optional[AppRole]:
    role_name = _resolve_core_role_name(session, user.role_id)
    if not role_name:
        return None
    return CORE_ROLE_TO_APP_ROLE.get(role_name)


def list_user_profiles(
    session: Session,
    *,
    tenant_id: int,
) -> list[UserProfileRead]:
    users = session.exec(
        select(User)
        .where(
            User.tenant_id == tenant_id,
            User.is_super_admin.is_(False),
        )
        .order_by(User.full_name.asc())
    ).all()

    return [
        UserProfileRead(
            id=int(user.id or 0),
            full_name=user.full_name,
            email=user.email,
            approved=bool(user.is_active),
            created_at=user.created_at,
            updated_at=user.created_at,
            organization_id=int(user.tenant_id or tenant_id),
        )
        for user in users
        if user.id is not None
    ]


def list_user_roles(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
) -> UserRolesRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    rows = session.exec(
        select(UserAppRole).where(
            UserAppRole.tenant_id == tenant_id,
            UserAppRole.user_id == user_id,
        )
    ).all()
    roles = [row.role for row in rows if row.role]

    if not roles:
        fallback_role = _core_role_as_app_role(session, user)
        if fallback_role:
            roles = [fallback_role]

    # Preserve insertion order while deduplicating
    deduped = list(dict.fromkeys(roles))
    return UserRolesRead(user_id=user_id, roles=deduped)  # type: ignore[arg-type]


def add_user_role(
    session: Session,
    *,
    tenant_id: int,
    current_user_id: Optional[int],
    user_id: int,
    role: AppRole,
) -> UserRolesRead:
    _user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    exists = session.exec(
        select(UserAppRole).where(
            UserAppRole.tenant_id == tenant_id,
            UserAppRole.user_id == user_id,
            UserAppRole.role == role,
        )
    ).first()
    if not exists:
        session.add(
            UserAppRole(
                tenant_id=tenant_id,
                user_id=user_id,
                role=role,
                created_by_id=current_user_id,
            )
        )
        session.commit()

    return list_user_roles(session, tenant_id=tenant_id, user_id=user_id)


def remove_user_role(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    role: AppRole,
) -> UserRolesRead:
    _user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    row = session.exec(
        select(UserAppRole).where(
            UserAppRole.tenant_id == tenant_id,
            UserAppRole.user_id == user_id,
            UserAppRole.role == role,
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return list_user_roles(session, tenant_id=tenant_id, user_id=user_id)


def approve_user(
    session: Session,
    *,
    tenant_id: int,
    current_user_id: Optional[int],
    user_id: int,
    role: AppRole,
) -> UserProfileRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    user.is_active = True
    session.add(user)
    session.commit()
    add_user_role(
        session,
        tenant_id=tenant_id,
        current_user_id=current_user_id,
        user_id=user_id,
        role=role,
    )
    session.refresh(user)
    return UserProfileRead(
        id=int(user.id or 0),
        full_name=user.full_name,
        email=user.email,
        approved=bool(user.is_active),
        created_at=user.created_at,
        updated_at=user.created_at,
        organization_id=int(user.tenant_id or tenant_id),
    )


def list_user_assignments(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
) -> UserAssignmentsRead:
    _user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    rows = session.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == user_id,
        )
    ).all()
    return UserAssignmentsRead(
        user_id=user_id,
        work_ids=[int(row.project_id) for row in rows],
    )


def assign_user_to_work(
    session: Session,
    *,
    tenant_id: int,
    current_user_id: Optional[int],
    user_id: int,
    work_id: int,
) -> UserAssignmentsRead:
    _user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    _project_or_404(session, tenant_id=tenant_id, project_id=work_id)

    row = session.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == user_id,
            UserWorkAssignment.project_id == work_id,
        )
    ).first()
    if not row:
        session.add(
            UserWorkAssignment(
                tenant_id=tenant_id,
                user_id=user_id,
                project_id=work_id,
                created_by_id=current_user_id,
            )
        )
        session.commit()
    return list_user_assignments(session, tenant_id=tenant_id, user_id=user_id)


def remove_user_from_work(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    work_id: int,
) -> UserAssignmentsRead:
    _user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    row = session.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == user_id,
            UserWorkAssignment.project_id == work_id,
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return list_user_assignments(session, tenant_id=tenant_id, user_id=user_id)


def list_assignable_foremen(
    session: Session,
    *,
    tenant_id: int,
) -> list[UserProfileRead]:
    user_ids_from_app_roles = session.exec(
        select(UserAppRole.user_id).where(
            UserAppRole.tenant_id == tenant_id,
            UserAppRole.role == "foreman",
        )
    ).all()

    # Fallback for users that still use only the core RBAC role.
    core_role = session.exec(select(Role).where(Role.name == "user")).first()
    fallback_users: list[User] = []
    if core_role:
        fallback_users = session.exec(
            select(User).where(
                User.tenant_id == tenant_id,
                User.role_id == core_role.id,
                User.is_super_admin.is_(False),
            )
        ).all()

    candidate_ids = {int(user_id) for user_id in user_ids_from_app_roles if user_id is not None}
    candidate_ids.update(int(u.id) for u in fallback_users if u.id is not None)

    if not candidate_ids:
        return []

    users = session.exec(
        select(User)
        .where(
            User.tenant_id == tenant_id,
            User.id.in_(candidate_ids),
            User.is_super_admin.is_(False),
        )
        .order_by(User.full_name.asc())
    ).all()

    return [
        UserProfileRead(
            id=int(user.id or 0),
            full_name=user.full_name,
            email=user.email,
            approved=bool(user.is_active),
            created_at=user.created_at,
            updated_at=user.created_at,
            organization_id=int(user.tenant_id or tenant_id),
        )
        for user in users
        if user.id is not None
    ]


def delete_user_related_data(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
) -> None:
    role_rows = session.exec(
        select(UserAppRole).where(
            UserAppRole.tenant_id == tenant_id,
            UserAppRole.user_id == user_id,
        )
    ).all()
    for row in role_rows:
        session.delete(row)

    assignment_rows = session.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == user_id,
        )
    ).all()
    for row in assignment_rows:
        session.delete(row)

    if role_rows or assignment_rows:
        session.commit()

