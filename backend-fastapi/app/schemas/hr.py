from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: bool = True
    project_allocation_percentage: Decimal = Decimal(100)


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None
    project_allocation_percentage: Optional[Decimal] = None


class DepartmentRead(DepartmentBase):
    id: int
    tenant_id: int
    created_at: datetime


class EmployeeProfileBase(BaseModel):
    user_id: Optional[int] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    available_hours: Optional[Decimal] = None
    availability_percentage: Optional[Decimal] = None
    position: Optional[str] = None
    titulacion: Optional[str] = None
    employment_type: str = "permanent"
    hire_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True


class EmployeeProfileCreate(EmployeeProfileBase):
    primary_department_id: Optional[int] = None


class EmployeeProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    available_hours: Optional[Decimal] = None
    availability_percentage: Optional[Decimal] = None
    position: Optional[str] = None
    titulacion: Optional[str] = None
    employment_type: Optional[str] = None
    hire_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    primary_department_id: Optional[int] = None


class EmployeeProfileRead(EmployeeProfileBase):
    id: int
    tenant_id: int
    created_at: datetime
    primary_department_id: Optional[int] = None


class HeadcountItem(BaseModel):
    department_id: Optional[int]
    department_name: Optional[str]
    total_employees: int


class EmployeeAllocationBase(BaseModel):
    employee_id: int
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    milestone: Optional[str] = None
    year: int
    allocated_hours: Optional[Decimal] = None
    notes: Optional[str] = None


class EmployeeAllocationCreate(EmployeeAllocationBase):
    tenant_id: int


class EmployeeAllocationUpdate(BaseModel):
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    milestone: Optional[str] = None
    year: Optional[int] = None
    allocated_hours: Optional[Decimal] = None
    notes: Optional[str] = None


class EmployeeAllocationRead(EmployeeAllocationBase):
    id: int
    tenant_id: int
    created_at: datetime
    updated_at: datetime
