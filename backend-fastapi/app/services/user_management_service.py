from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.erp import Project, WorkReport
from app.models.role import Role
from app.models.user import User
from app.policies.access_policies import can_user_manage_target_user, can_user_view_target_user
from app.models.user_app_role import UserAppRole
from app.models.user_work_assignment import UserWorkAssignment
from app.schemas.user_management import (
    AppRole,
    UserAssignmentsRead,
    UserProfileRead,
    UserRolesRead,
    WorkMemberRead,
    WorkMessageDirectoryRead,
)
from app.services.user_service import resolve_creator_group_id


CORE_ROLE_TO_APP_ROLE: dict[str, AppRole] = {
    "super_admin": "master",
    "tenant_admin": "admin",
    # "usuario" no tiene AppRole de fallback — requiere UserAppRole explícito
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


def _normalize_directory_work_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _resolve_directory_work_names(
    session: Session,
    *,
    tenant_id: int,
    project_ids: set[int],
) -> dict[int, str]:
    if not project_ids:
        return {}

    reports = session.exec(
        select(WorkReport)
        .where(
            WorkReport.tenant_id == tenant_id,
            WorkReport.project_id.in_(project_ids),
            WorkReport.deleted_at.is_(None),
        )
        .order_by(WorkReport.project_id.asc(), WorkReport.created_at.desc(), WorkReport.id.desc())
    ).all()

    names_by_project_id: dict[int, str] = {}
    for report in reports:
        project_id = int(report.project_id)
        if project_id in names_by_project_id:
            continue

        payload = report.payload if isinstance(report.payload, dict) else {}
        preferred_name = (
            _normalize_directory_work_name(payload.get("workName"))
            or _normalize_directory_work_name(payload.get("work_name"))
            or _normalize_directory_work_name(payload.get("title"))
            or _normalize_directory_work_name(report.title)
        )
        if preferred_name:
            names_by_project_id[project_id] = preferred_name

    return names_by_project_id


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
    current_user: User,
    app_role: Optional[str] = None,
) -> list[UserProfileRead]:
    if app_role is not None:
        user_ids = session.exec(
            select(UserAppRole.user_id).where(
                UserAppRole.tenant_id == tenant_id,
                UserAppRole.role == app_role,
            )
        ).all()
        stmt = (
            select(User)
            .where(User.tenant_id == tenant_id, User.id.in_(user_ids), User.is_super_admin.is_(False))
            .order_by(User.full_name.asc())
        )
    else:
        stmt = (
            select(User)
            .where(User.tenant_id == tenant_id, User.is_super_admin.is_(False))
            .order_by(User.full_name.asc())
        )
    if not current_user.is_super_admin:
        group_id = resolve_creator_group_id(session, current_user, persist=True)
        if group_id is not None:
            stmt = stmt.where(User.creator_group_id == group_id)
    users = session.exec(stmt).all()

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
    current_user: User,
    user_id: int,
    role: AppRole,
) -> UserRolesRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    if not current_user.is_super_admin:
        if not can_user_manage_target_user(session, current_user, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para gestionar este usuario.",
            )

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
                created_by_id=current_user.id,
            )
        )
        session.commit()

    return list_user_roles(session, tenant_id=tenant_id, user_id=user_id)


def remove_user_role(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    user_id: int,
    role: AppRole,
) -> UserRolesRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    if not current_user.is_super_admin:
        if not can_user_manage_target_user(session, current_user, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para gestionar este usuario.",
            )

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
    current_user: User,
    user_id: int,
    role: AppRole,
) -> UserProfileRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    if not current_user.is_super_admin:
        if not can_user_manage_target_user(session, current_user, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para gestionar este usuario.",
            )

    user.is_active = True
    session.add(user)
    session.commit()
    add_user_role(
        session,
        tenant_id=tenant_id,
        current_user=current_user,
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


def list_work_members(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    work_id: int,
) -> list[WorkMemberRead]:
    _project_or_404(session, tenant_id=tenant_id, project_id=work_id)

    users = session.exec(
        select(User)
        .join(UserWorkAssignment, UserWorkAssignment.user_id == User.id)
        .where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.project_id == work_id,
            User.tenant_id == tenant_id,
            User.is_super_admin.is_(False),
        )
        .order_by(User.full_name.asc())
    ).all()

    visible_users_by_id: dict[int, User] = {}
    for user in users:
        if user.id is None:
            continue
        if not can_user_view_target_user(session, current_user, user):
            continue
        visible_users_by_id.setdefault(int(user.id), user)

    return [
        WorkMemberRead(
            id=int(user.id or 0),
            full_name=user.full_name,
            email=user.email,
        )
        for user in visible_users_by_id.values()
        if user.id is not None
    ]


def list_work_message_directory(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
) -> list[WorkMessageDirectoryRead]:
    if current_user.is_super_admin:
        return []

    rows = session.exec(
        select(Project, User)
        .join(UserWorkAssignment, UserWorkAssignment.project_id == Project.id)
        .join(User, User.id == UserWorkAssignment.user_id)
        .where(
            Project.tenant_id == tenant_id,
            UserWorkAssignment.tenant_id == tenant_id,
            User.tenant_id == tenant_id,
            User.is_super_admin.is_(False),
        )
        .order_by(Project.name.asc(), User.full_name.asc())
    ).all()

    project_ids = {int(project.id) for project, _member in rows if project.id is not None}
    directory_names_by_project_id = _resolve_directory_work_names(
        session,
        tenant_id=tenant_id,
        project_ids=project_ids,
    )

    projects_by_id: dict[int, WorkMessageDirectoryRead] = {}
    seen_members_by_project_id: dict[int, set[int]] = {}
    for project, member in rows:
        if project.id is None or not can_user_view_target_user(session, current_user, member):
            continue
        if member.id is None:
            continue

        project_id = int(project.id)
        member_id = int(member.id)
        seen_member_ids = seen_members_by_project_id.setdefault(project_id, set())
        if member_id in seen_member_ids:
            continue
        seen_member_ids.add(member_id)

        existing = projects_by_id.get(project_id)
        if existing is None:
            resolved_name = (
                directory_names_by_project_id.get(project_id)
                or _normalize_directory_work_name(project.name)
                or f"Obra {project_id}"
            )
            projects_by_id[project_id] = WorkMessageDirectoryRead(
                id=project_id,
                name=resolved_name,
                visible_member_count=1,
            )
            continue

        existing.visible_member_count += 1

    return sorted(projects_by_id.values(), key=lambda item: (item.name.lower(), item.id))


def assign_user_to_work(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    user_id: int,
    work_id: int,
) -> UserAssignmentsRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    _project_or_404(session, tenant_id=tenant_id, project_id=work_id)

    if not current_user.is_super_admin:
        if not can_user_manage_target_user(session, current_user, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para gestionar este usuario.",
            )

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
                created_by_id=current_user.id,
            )
        )
        session.commit()
    return list_user_assignments(session, tenant_id=tenant_id, user_id=user_id)


def remove_user_from_work(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    user_id: int,
    work_id: int,
) -> UserAssignmentsRead:
    user = _user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    if not current_user.is_super_admin:
        if not can_user_manage_target_user(session, current_user, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para gestionar este usuario.",
            )

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
    core_role = session.exec(select(Role).where(Role.name == "usuario")).first()
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
