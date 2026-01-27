from datetime import datetime
from typing import List, Optional

from sqlmodel import Session, select, func

from app.core.audit import log_action
from app.models.hr import Department, EmployeeProfile, EmployeeDepartment, EmployeeAllocation
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.hr import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    EmployeeProfileCreate,
    EmployeeProfileRead,
    EmployeeProfileUpdate,
    HeadcountItem,
    EmployeeAllocationCreate,
    EmployeeAllocationRead,
    EmployeeAllocationUpdate,
)


def _ensure_same_tenant(tenant_id: int, user: User) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para gestionar este tenant")


def create_department(
    session: Session,
    current_user: User,
    tenant_id: int,
    data: DepartmentCreate,
) -> DepartmentRead:
    _ensure_same_tenant(tenant_id, current_user)

    # Validamos que el manager, si se indica, pertenece al tenant.
    if data.manager_id is not None:
        manager = session.get(User, data.manager_id)
        if not manager or manager.tenant_id != tenant_id:
            raise ValueError("El manager debe pertenecer al mismo tenant")

    dept = Department(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        manager_id=data.manager_id,
        is_active=data.is_active,
    )
    session.add(dept)
    session.commit()
    session.refresh(dept)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="hr.department.create",
        details=f"Departamento creado: {dept.name}",
    )

    return DepartmentRead(
        id=dept.id,
        tenant_id=dept.tenant_id,
        name=dept.name,
        description=dept.description,
        manager_id=dept.manager_id,
        is_active=dept.is_active,
        created_at=dept.created_at,
    )


def list_departments(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
) -> List[DepartmentRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id

    stmt = select(Department)
    if tenant_id is not None:
        stmt = stmt.where(Department.tenant_id == tenant_id)

    depts = session.exec(stmt).all()

    return [
        DepartmentRead(
            id=d.id,
            tenant_id=d.tenant_id,
            name=d.name,
            description=d.description,
            manager_id=d.manager_id,
            is_active=d.is_active,
            created_at=d.created_at,
        )
        for d in depts
    ]


def update_department(
    session: Session,
    current_user: User,
    dept_id: int,
    data: DepartmentUpdate,
) -> DepartmentRead:
    dept = session.get(Department, dept_id)
    if not dept:
        raise ValueError("Departamento no encontrado")

    _ensure_same_tenant(dept.tenant_id, current_user)

    if data.manager_id is not None:
        manager = session.get(User, data.manager_id)
        if not manager or manager.tenant_id != dept.tenant_id:
            raise ValueError("El manager debe pertenecer al mismo tenant")

    if data.name is not None:
        dept.name = data.name
    if data.description is not None:
        dept.description = data.description
    if data.manager_id is not None:
        dept.manager_id = data.manager_id
    if data.is_active is not None:
        dept.is_active = data.is_active

    session.add(dept)
    session.commit()
    session.refresh(dept)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=dept.tenant_id,
        action="hr.department.update",
        details=f"Departamento actualizado: {dept.id}",
    )

    return DepartmentRead(
        id=dept.id,
        tenant_id=dept.tenant_id,
        name=dept.name,
        description=dept.description,
        manager_id=dept.manager_id,
        is_active=dept.is_active,
        created_at=dept.created_at,
    )


def create_employee_profile(
    session: Session,
    current_user: User,
    tenant_id: int,
    data: EmployeeProfileCreate,
) -> EmployeeProfileRead:
    _ensure_same_tenant(tenant_id, current_user)

    user = None
    if data.user_id is not None:
        user = session.get(User, data.user_id)
        if not user or user.tenant_id != tenant_id:
            raise ValueError("El usuario debe pertenecer al tenant")

        existing = session.exec(
            select(EmployeeProfile).where(EmployeeProfile.user_id == user.id),
        ).one_or_none()
        if existing:
            raise ValueError("Ya existe un perfil de empleado para este usuario")
    else:
        if not data.full_name:
            raise ValueError("El nombre completo es obligatorio si no hay usuario asociado")

    email_value = data.email or (user.email if user else None)
    email = (email_value or "").strip().lower() or None
    if email:
        existing_email = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.tenant_id == tenant_id,
                func.lower(EmployeeProfile.email) == email,
            ),
        ).one_or_none()
        if existing_email:
            raise ValueError("Ya existe un empleado con ese correo en este tenant")

        existing_user_email = session.exec(
            select(User).where(
                User.tenant_id == tenant_id,
                func.lower(User.email) == email,
            ),
        ).one_or_none()
        if existing_user_email and (not user or existing_user_email.id != user.id):
            raise ValueError("El correo ya pertenece a un usuario del tenant")

    profile = EmployeeProfile(
        tenant_id=tenant_id,
        user_id=user.id if user else None,
        full_name=data.full_name or (user.full_name if user else None),
        email=email,
        hourly_rate=data.hourly_rate,
        available_hours=data.available_hours,
        availability_percentage=data.availability_percentage,
        position=data.position,
        employment_type=data.employment_type,
        hire_date=data.hire_date,
        end_date=data.end_date,
        is_active=data.is_active,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)

    if data.primary_department_id is not None:
        dept = session.get(Department, data.primary_department_id)
        if not dept or dept.tenant_id != tenant_id:
            raise ValueError("El departamento principal debe pertenecer al tenant")
        session.add(
            EmployeeDepartment(
                employee_id=profile.id,
                department_id=dept.id,
                is_primary=True,
            ),
        )
        session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="hr.employee.create",
        details=(
            f"Perfil empleado creado para user_id={user.id}"
            if user
            else f"Perfil empleado creado para {profile.full_name}"
        ),
    )

    primary_department_id = None
    if data.primary_department_id is not None:
        primary_department_id = data.primary_department_id

    return EmployeeProfileRead(
        id=profile.id,
        tenant_id=profile.tenant_id,
        user_id=profile.user_id,
        full_name=profile.full_name or (user.full_name if user else None),
        email=profile.email or (user.email if user else None),
        hourly_rate=profile.hourly_rate,
        available_hours=profile.available_hours,
        availability_percentage=profile.availability_percentage,
        position=profile.position,
        employment_type=profile.employment_type,
        hire_date=profile.hire_date,
        end_date=profile.end_date,
        is_active=profile.is_active,
        created_at=profile.created_at,
        primary_department_id=primary_department_id,
    )


def list_employee_profiles(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
) -> List[EmployeeProfileRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id
    stmt = select(EmployeeProfile)
    if tenant_id is not None:
        stmt = stmt.where(EmployeeProfile.tenant_id == tenant_id)

    profiles = session.exec(stmt).all()

    user_map = {}
    user_ids = [p.user_id for p in profiles if p.user_id]
    if user_ids:
        users = session.exec(select(User).where(User.id.in_(user_ids))).all()
        user_map = {u.id: u for u in users}

    # Resolvemos departamento principal por empleado.
    if profiles:
        emp_ids = [p.id for p in profiles]
        links = session.exec(
            select(EmployeeDepartment).where(
                EmployeeDepartment.employee_id.in_(emp_ids),
                EmployeeDepartment.is_primary.is_(True),
            ),
        ).all()
        primary_by_emp = {l.employee_id: l.department_id for l in links}
    else:
        primary_by_emp = {}

    result: List[EmployeeProfileRead] = []
    for p in profiles:
        result.append(
            EmployeeProfileRead(
                id=p.id,
                tenant_id=p.tenant_id,
                user_id=p.user_id,
                full_name=p.full_name or (user_map.get(p.user_id).full_name if p.user_id else None),
                email=p.email or (user_map.get(p.user_id).email if p.user_id else None),
                hourly_rate=p.hourly_rate,
                available_hours=p.available_hours,
                availability_percentage=p.availability_percentage,
                position=p.position,
                employment_type=p.employment_type,
                hire_date=p.hire_date,
                end_date=p.end_date,
                is_active=p.is_active,
                created_at=p.created_at,
                primary_department_id=primary_by_emp.get(p.id),
            ),
        )

    return result


# ----- Employee allocations (horas asignadas) -----
def list_employee_allocations(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
    project_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    year: Optional[int] = None,
) -> List[EmployeeAllocationRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id

    stmt = select(EmployeeAllocation)
    if tenant_id is not None:
        stmt = stmt.where(EmployeeAllocation.tenant_id == tenant_id)
    if project_id is not None:
        stmt = stmt.where(EmployeeAllocation.project_id == project_id)
    if employee_id is not None:
        stmt = stmt.where(EmployeeAllocation.employee_id == employee_id)
    if year is not None:
        stmt = stmt.where(EmployeeAllocation.year == year)

    allocations = session.exec(stmt).all()
    return [
        EmployeeAllocationRead(
            id=a.id,
            tenant_id=a.tenant_id,
            employee_id=a.employee_id,
            department_id=a.department_id,
            project_id=a.project_id,
            milestone=a.milestone,
            year=a.year,
            allocated_hours=a.allocated_hours,
            notes=a.notes,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in allocations
    ]


def create_employee_allocation(
    session: Session,
    current_user: User,
    data: EmployeeAllocationCreate,
) -> EmployeeAllocationRead:
    _ensure_same_tenant(data.tenant_id, current_user)

    allocation = EmployeeAllocation(
        tenant_id=data.tenant_id,
        employee_id=data.employee_id,
        department_id=data.department_id,
        project_id=data.project_id,
        milestone=data.milestone,
        year=data.year,
        allocated_hours=data.allocated_hours,
        notes=data.notes,
    )
    session.add(allocation)
    session.commit()
    session.refresh(allocation)

    return EmployeeAllocationRead(
        id=allocation.id,
        tenant_id=allocation.tenant_id,
        employee_id=allocation.employee_id,
        department_id=allocation.department_id,
        project_id=allocation.project_id,
        milestone=allocation.milestone,
        year=allocation.year,
        allocated_hours=allocation.allocated_hours,
        notes=allocation.notes,
        created_at=allocation.created_at,
        updated_at=allocation.updated_at,
    )


def update_employee_allocation(
    session: Session,
    current_user: User,
    allocation_id: int,
    data: EmployeeAllocationUpdate,
) -> EmployeeAllocationRead:
    allocation = session.get(EmployeeAllocation, allocation_id)
    if not allocation:
        raise ValueError("Asignación no encontrada")
    _ensure_same_tenant(allocation.tenant_id, current_user)

    if data.department_id is not None:
        allocation.department_id = data.department_id
    if data.project_id is not None:
        allocation.project_id = data.project_id
    if data.milestone is not None:
        allocation.milestone = data.milestone
    if data.year is not None:
        allocation.year = data.year
    if data.allocated_hours is not None:
        allocation.allocated_hours = data.allocated_hours
    if data.notes is not None:
        allocation.notes = data.notes

    allocation.updated_at = datetime.utcnow()
    session.add(allocation)
    session.commit()
    session.refresh(allocation)

    return EmployeeAllocationRead(
        id=allocation.id,
        tenant_id=allocation.tenant_id,
        employee_id=allocation.employee_id,
        department_id=allocation.department_id,
        project_id=allocation.project_id,
        milestone=allocation.milestone,
        year=allocation.year,
        allocated_hours=allocation.allocated_hours,
        notes=allocation.notes,
        created_at=allocation.created_at,
        updated_at=allocation.updated_at,
    )


def delete_employee_allocation(
    session: Session,
    current_user: User,
    allocation_id: int,
) -> None:
    allocation = session.get(EmployeeAllocation, allocation_id)
    if not allocation:
        return
    _ensure_same_tenant(allocation.tenant_id, current_user)
    session.delete(allocation)
    session.commit()


def update_employee_profile(
    session: Session,
    current_user: User,
    profile_id: int,
    data: EmployeeProfileUpdate,
) -> EmployeeProfileRead:
    profile = session.get(EmployeeProfile, profile_id)
    if not profile:
        raise ValueError("Perfil de empleado no encontrado")

    _ensure_same_tenant(profile.tenant_id, current_user)

    if data.email is not None:
        email = data.email.strip().lower() or None
        current_email = (profile.email or "").strip().lower() or None
        if email != current_email and email:
            existing_email = session.exec(
                select(EmployeeProfile).where(
                    EmployeeProfile.tenant_id == profile.tenant_id,
                    func.lower(EmployeeProfile.email) == email,
                    EmployeeProfile.id != profile.id,
                ),
            ).first()
            if existing_email:
                raise ValueError("Ya existe un empleado con ese correo en este tenant")

            existing_user_email = session.exec(
                select(User).where(
                    User.tenant_id == profile.tenant_id,
                    func.lower(User.email) == email,
                    User.id != profile.user_id,
                ),
            ).first()
            if existing_user_email:
                raise ValueError("El correo ya pertenece a un usuario del tenant")

        profile.email = email

    if data.position is not None:
        profile.position = data.position
    if data.full_name is not None:
        profile.full_name = data.full_name
    if data.hourly_rate is not None:
        profile.hourly_rate = data.hourly_rate
    if data.employment_type is not None:
        profile.employment_type = data.employment_type
    if data.hire_date is not None:
        profile.hire_date = data.hire_date
    if data.end_date is not None:
        profile.end_date = data.end_date
    if data.is_active is not None:
        profile.is_active = data.is_active
    if data.available_hours is not None:
        profile.available_hours = data.available_hours
    if data.availability_percentage is not None:
        profile.availability_percentage = data.availability_percentage

    session.add(profile)
    session.commit()
    session.refresh(profile)

    primary_department_id = None
    if data.primary_department_id is not None:
        dept = session.get(Department, data.primary_department_id)
        if not dept or dept.tenant_id != profile.tenant_id:
            raise ValueError("El departamento principal debe pertenecer al tenant")

        # Actualizamos el enlace principal.
        existing = session.exec(
            select(EmployeeDepartment).where(
                EmployeeDepartment.employee_id == profile.id,
            ),
        ).all()
        for link in existing:
            link.is_primary = False
            session.add(link)

        link = session.exec(
            select(EmployeeDepartment).where(
                EmployeeDepartment.employee_id == profile.id,
                EmployeeDepartment.department_id == dept.id,
            ),
        ).one_or_none()
        if not link:
            link = EmployeeDepartment(
                employee_id=profile.id,
                department_id=dept.id,
                is_primary=True,
            )
            session.add(link)
        else:
            link.is_primary = True
            session.add(link)

        session.commit()
        primary_department_id = dept.id

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=profile.tenant_id,
        action="hr.employee.update",
        details=f"Perfil empleado actualizado id={profile.id}",
    )

    if primary_department_id is None:
        # Intentamos recuperar el actual si no se ha actualizado.
        link = session.exec(
            select(EmployeeDepartment).where(
                EmployeeDepartment.employee_id == profile.id,
                EmployeeDepartment.is_primary.is_(True),
            ),
        ).one_or_none()
        if link:
            primary_department_id = link.department_id

    return EmployeeProfileRead(
        id=profile.id,
        tenant_id=profile.tenant_id,
        user_id=profile.user_id,
        full_name=profile.full_name,
        email=profile.email,
        hourly_rate=profile.hourly_rate,
        available_hours=profile.available_hours,
        availability_percentage=profile.availability_percentage,
        position=profile.position,
        employment_type=profile.employment_type,
        hire_date=profile.hire_date,
        end_date=profile.end_date,
        is_active=profile.is_active,
        created_at=profile.created_at,
        primary_department_id=primary_department_id,
    )


def delete_employee_profile(
    session: Session,
    current_user: User,
    profile_id: int,
) -> None:
    profile = session.get(EmployeeProfile, profile_id)
    if not profile:
        raise ValueError("Perfil de empleado no encontrado")

    _ensure_same_tenant(profile.tenant_id, current_user)

    links = session.exec(
        select(EmployeeDepartment).where(
            EmployeeDepartment.employee_id == profile.id,
        ),
    ).all()
    for link in links:
        session.delete(link)

    session.delete(profile)
    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=profile.tenant_id,
        action="hr.employee.delete",
        details=f"Perfil empleado eliminado id={profile.id}",
    )


def get_headcount_by_department(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
) -> List[HeadcountItem]:
    """
    Devuelve el número de empleados activos por departamento dentro de un tenant.
    """

    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id
    elif tenant_id is None:
        return []

    if tenant_id is None:
        return []

    # Join entre EmployeeProfile, EmployeeDepartment y Department.
    stmt = (
        select(
            EmployeeDepartment.department_id,
            Department.name,
            func.count(EmployeeProfile.id),
        )
        .join(
            EmployeeProfile,
            EmployeeProfile.id == EmployeeDepartment.employee_id,
        )
        .join(
            Department,
            Department.id == EmployeeDepartment.department_id,
        )
        .where(
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.is_active.is_(True),
            Department.is_active.is_(True),
        )
        .group_by(EmployeeDepartment.department_id, Department.name)
    )

    rows = session.exec(stmt).all()

    return [
        HeadcountItem(
            department_id=row[0],
            department_name=row[1],
            total_employees=row[2],
        )
        for row in rows
    ]
