from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.hr import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    EmployeeProfileCreate,
    EmployeeProfileRead,
    EmployeeProfileUpdate,
    EmployeeAllocationCreate,
    EmployeeAllocationRead,
    EmployeeAllocationUpdate,
    HeadcountItem,
)
from app.services.hr_service import (
    create_department,
    list_departments,
    update_department,
    create_employee_profile,
    list_employee_profiles,
    update_employee_profile,
    delete_employee_profile,
    get_headcount_by_department,
    list_employee_allocations,
    create_employee_allocation,
    update_employee_allocation,
    delete_employee_allocation,
)


router = APIRouter()


@router.get(
    "/departments",
    response_model=List[DepartmentRead],
    summary="Listar departamentos del tenant",
)
def api_list_departments(
    tenant_id: Optional[int] = Query(
        default=None,
        description="Filtrar por tenant (solo Super Admin).",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:read"])),
) -> List[DepartmentRead]:
    try:
        return list_departments(session=session, current_user=current_user, tenant_id=tenant_id)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/departments",
    response_model=DepartmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear departamento",
)
def api_create_department(
    data: DepartmentCreate,
    tenant_id: Optional[int] = Query(
        default=None,
        description="Tenant objetivo (solo Super Admin).",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:manage"])),
) -> DepartmentRead:
    target_tenant_id = current_user.tenant_id
    if current_user.is_super_admin:
        target_tenant_id = tenant_id
    if target_tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes indicar el tenant para crear el departamento.",
        )

    try:
        return create_department(
            session=session,
            current_user=current_user,
            tenant_id=target_tenant_id,
            data=data,
        )

    except (PermissionError, ValueError) as exc:
        status_code = (
            status.HTTP_403_FORBIDDEN
            if isinstance(exc, PermissionError)
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.patch(
    "/departments/{dept_id}",
    response_model=DepartmentRead,
    summary="Actualizar departamento",
)
def api_update_department(
    dept_id: int,
    data: DepartmentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:manage"])),
) -> DepartmentRead:
    try:
        return update_department(
            session=session,
            current_user=current_user,
            dept_id=dept_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/employees",
    response_model=List[EmployeeProfileRead],
    summary="Listar empleados del tenant",
)
def api_list_employees(
    tenant_id: Optional[int] = Query(
        default=None,
        description="Filtrar por tenant (solo Super Admin).",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:read"])),
) -> List[EmployeeProfileRead]:
    try:
        return list_employee_profiles(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/employees",
    response_model=EmployeeProfileRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear perfil de empleado",
)
def api_create_employee(
    data: EmployeeProfileCreate,
    tenant_id: Optional[int] = Query(
        default=None,
        description="Tenant objetivo (solo Super Admin).",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:manage"])),
) -> EmployeeProfileRead:
    target_tenant_id = current_user.tenant_id
    if current_user.is_super_admin:
        target_tenant_id = tenant_id
    if target_tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes indicar el tenant para crear el empleado.",
        )

    try:
        return create_employee_profile(
            session=session,
            current_user=current_user,
            tenant_id=target_tenant_id,
            data=data,
        )

    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch(
    "/employees/{profile_id}",
    response_model=EmployeeProfileRead,
    summary="Actualizar perfil de empleado",
)
def api_update_employee(
    profile_id: int,
    data: EmployeeProfileUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:manage"])),
) -> EmployeeProfileRead:
    try:
        return update_employee_profile(
            session=session,
            current_user=current_user,
            profile_id=profile_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/employees/{profile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar perfil de empleado",
)
def api_delete_employee(
    profile_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:manage"])),
) -> None:
    try:
        delete_employee_profile(
            session=session,
            current_user=current_user,
            profile_id=profile_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/reports/headcount",
    response_model=List[HeadcountItem],
    summary="Headcount por departamento",
)
def api_headcount_report(
    tenant_id: Optional[int] = Query(
        default=None,
        description="Filtrar por tenant (solo Super Admin).",
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["hr:reports"])),
) -> List[HeadcountItem]:
    try:
        return get_headcount_by_department(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.get(
    "/allocations",
    response_model=List[EmployeeAllocationRead],
    summary="Listar asignaciones de horas por empleado/proyecto",
)
def api_list_allocations(
    tenant_id: Optional[int] = Query(
        default=None,
        description="Filtrar por tenant (solo Super Admin).",
    ),
    project_id: Optional[int] = Query(default=None, description="Filtrar por proyecto"),
    employee_id: Optional[int] = Query(default=None, description="Filtrar por empleado"),
    year: Optional[int] = Query(default=None, description="Año de las asignaciones"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["hr:read", "erp:read"])),
) -> List[EmployeeAllocationRead]:
    try:
        return list_employee_allocations(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            project_id=project_id,
            employee_id=employee_id,
            year=year,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/allocations",
    response_model=EmployeeAllocationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear asignación de horas",
)
def api_create_allocation(
    data: EmployeeAllocationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["hr:manage", "erp:manage"])),
) -> EmployeeAllocationRead:
    try:
        return create_employee_allocation(
            session=session,
            current_user=current_user,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch(
    "/allocations/{allocation_id}",
    response_model=EmployeeAllocationRead,
    summary="Actualizar asignación de horas",
)
def api_update_allocation(
    allocation_id: int,
    data: EmployeeAllocationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["hr:manage", "erp:manage"])),
) -> EmployeeAllocationRead:
    try:
        return update_employee_allocation(
            session=session,
            current_user=current_user,
            allocation_id=allocation_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/allocations/{allocation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar asignación de horas",
)
def api_delete_allocation(
    allocation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["hr:manage", "erp:manage"])),
) -> None:
    try:
        delete_employee_allocation(
            session=session,
            current_user=current_user,
            allocation_id=allocation_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

