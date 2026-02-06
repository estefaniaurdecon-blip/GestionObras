from __future__ import annotations

from typing import Optional, Set

from sqlmodel import Session, select

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile
from app.contracts.models import ContractDepartment


ROLE_JEFE_OBRA = "jefe_obra"
ROLE_GERENCIA = "gerencia"
ROLE_ADMIN = "administracion"
ROLE_COMPRAS = "compras"
ROLE_JURIDICO = "juridico"

ROLE_BY_DEPARTMENT = {
    ContractDepartment.GERENCIA: ROLE_GERENCIA,
    ContractDepartment.ADMIN: ROLE_ADMIN,
    ContractDepartment.COMPRAS: ROLE_COMPRAS,
    ContractDepartment.JURIDICO: ROLE_JURIDICO,
}

DEPARTMENT_NAME_MAP = {
    "gerencia": ContractDepartment.GERENCIA,
    "administracion": ContractDepartment.ADMIN,
    "compras": ContractDepartment.COMPRAS,
    "juridico": ContractDepartment.JURIDICO,
    "obra": None,
}


def ensure_tenant_access(user: User, tenant_id: int) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise PermissionError("El usuario no pertenece al tenant del contrato")


def _get_role_name(session: Session, user: User) -> Optional[str]:
    if not user.role_id:
        return None
    role = session.get(Role, user.role_id)
    return role.name.lower() if role else None


def _user_has_permission(session: Session, user: User, code: str) -> bool:
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


def _user_in_department(session: Session, user: User, department_key: str) -> bool:
    if not user.tenant_id:
        return False
    employee = session.exec(
        select(EmployeeProfile).where(
            EmployeeProfile.user_id == user.id,
            EmployeeProfile.tenant_id == user.tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).one_or_none()
    if not employee:
        return False

    statement = (
        select(Department.name)
        .join(EmployeeDepartment, EmployeeDepartment.department_id == Department.id)
        .where(EmployeeDepartment.employee_id == employee.id)
    )
    names = {row[0].strip().lower() for row in session.exec(statement).all() if row[0]}
    return department_key.lower() in names


def is_jefe_obra(session: Session, user: User) -> bool:
    role = _get_role_name(session, user)
    if role == ROLE_JEFE_OBRA:
        return True
    return _user_in_department(session, user, "obra")


def get_user_departments(session: Session, user: User) -> Set[ContractDepartment]:
    if user.is_super_admin:
        return {dept for dept in ContractDepartment}

    departments: Set[ContractDepartment] = set()
    role = _get_role_name(session, user)
    for dept, role_name in ROLE_BY_DEPARTMENT.items():
        if role == role_name:
            departments.add(dept)

    if not departments and user.tenant_id:
        employee = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.user_id == user.id,
                EmployeeProfile.tenant_id == user.tenant_id,
                EmployeeProfile.is_active.is_(True),
            )
        ).one_or_none()
        if employee:
            statement = (
                select(Department.name)
                .join(EmployeeDepartment, EmployeeDepartment.department_id == Department.id)
                .where(EmployeeDepartment.employee_id == employee.id)
            )
            for row in session.exec(statement).all():
                if not row[0]:
                    continue
                key = row[0].strip().lower()
                dept = DEPARTMENT_NAME_MAP.get(key)
                if isinstance(dept, ContractDepartment):
                    departments.add(dept)

    return departments


def can_create_contract(session: Session, user: User) -> bool:
    return is_jefe_obra(session, user) or _user_has_permission(
        session, user, "contracts:create"
    )


def can_edit_contract(session: Session, user: User) -> bool:
    return is_jefe_obra(session, user) or _user_has_permission(
        session, user, "contracts:edit"
    )


def can_view_contract(session: Session, user: User) -> bool:
    if user.is_super_admin:
        return True
    if _user_has_permission(session, user, "contracts:read"):
        return True
    return bool(get_user_departments(session, user)) or is_jefe_obra(session, user)


def can_approve_contract(session: Session, user: User) -> bool:
    return bool(get_user_departments(session, user)) or _user_has_permission(
        session, user, "contracts:approve"
    )


def can_reject_contract(session: Session, user: User) -> bool:
    return can_approve_contract(session, user) or _user_has_permission(
        session, user, "contracts:reject"
    )


def department_for_user(session: Session, user: User) -> Optional[ContractDepartment]:
    if user.is_super_admin:
        return None
    departments = get_user_departments(session, user)
    if departments:
        return sorted(departments, key=lambda d: d.value)[0]
    return None
