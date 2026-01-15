from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Field, SQLModel


class Department(SQLModel, table=True):
    """
    Departamento dentro de un tenant.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)

    name: str
    description: Optional[str] = None

    manager_id: Optional[int] = Field(
        default=None,
        foreign_key="user.id",
        description="Usuario manager del departamento (dentro del mismo tenant).",
    )

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmployeeProfile(SQLModel, table=True):
    """
    Perfil de empleado asociado a un usuario dentro de un tenant.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True, unique=True)

    full_name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=255)
    hourly_rate: Optional[Decimal] = Field(default=None)

    position: Optional[str] = None
    employment_type: str = Field(
        default="permanent",
        description="Tipo de contrato: permanent, temporary, contractor, etc.",
    )

    hire_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmployeeDepartment(SQLModel, table=True):
    """
    Relación N:N entre empleados y departamentos.
    """

    employee_id: int = Field(foreign_key="employeeprofile.id", primary_key=True)
    department_id: int = Field(foreign_key="department.id", primary_key=True)
    is_primary: bool = Field(
        default=False,
        description="Indica si es el departamento principal del empleado.",
    )
