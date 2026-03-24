from datetime import datetime, timezone
from datetime import date
from datetime import UTC
from decimal import Decimal
from math import ceil
from typing import Any, Optional

from sqlmodel import Session, select
from sqlalchemy import delete, func
from sqlalchemy.exc import IntegrityError

from app.models.erp import (
    Activity,
    AccessControlReport,
    BudgetLineMilestone,
    Deliverable,
    Milestone,
    Project,
    ProjectBudgetLine,
    ProjectBudgetMilestone,
    SubActivity,
    Task,
    TaskTemplate,
    TimeEntry,
    TimeSession,
    RentalMachinery,
    WorkPostventa,
    WorkRepaso,
    WorkReport,
    WorkReportSyncLog,
)
from app.models.inventory import WorkInventorySyncLog
from app.models.hr import Department, EmployeeProfile
from app.models.notification import NotificationType
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.schemas.erp import (
    ActivityCreate,
    AccessControlReportCreate,
    AccessControlReportUpdate,
    ActivityUpdate,
    DeliverableCreate,
    DeliverableUpdate,
    MilestoneCreate,
    MilestoneUpdate,
    ProjectCreate,
    ProjectUpdate,
    SubActivityCreate,
    SubActivityUpdate,
    TaskCreate,
    TaskTemplateCreate,
    TaskUpdate,
    BudgetLineMilestoneCreate,
    ProjectBudgetMilestoneCreate,
    ProjectBudgetMilestoneUpdate,
    ProjectBudgetLineCreate,
    ProjectBudgetLineUpdate,
    RentalMachineryCreate,
    RentalMachineryUpdate,
    WorkPostventaCreate,
    WorkPostventaUpdate,
    WorkRepasoCreate,
    WorkRepasoUpdate,
    WorkReportCreate,
    WorkReportSyncAck,
    WorkReportSyncRequest,
    WorkReportSyncResponse,
    WorkReportUpdate,
)
from app.services.notification_service import create_notification
from app.services.user_service import resolve_creator_group_id

TASK_STATUSES = {"pending", "in_progress", "done"}
WORK_REPORT_ALLOWED_STATUSES = {
    "draft",
    "pending",
    "approved",
    "completed",
    "missing_data",
    "missing_delivery_notes",
    "closed",
    "archived",
}
WORK_REPORT_CLOSED_STATUSES = {"closed"}
RENTAL_ALLOWED_STATUSES = {"active", "inactive", "archived"}
RENTAL_PRICE_UNITS = {"day", "hour", "month"}
WORK_SERVICE_ALLOWED_STATUSES = {"pending", "in_progress", "completed"}

# Valida que exista un tenant_id
def _optional_tenant(tenant_id: Optional[int]) -> Optional[int]:
    # Permite que tenant_id sea None para tareas de superadmin
    return tenant_id

def _require_tenant(tenant_id: Optional[int]) -> int:
    # Bloquea escrituras sin tenant (superadmin debe elegirlo).
    if tenant_id is None:
        raise ValueError("Tenant requerido para esta operacion.")
    return tenant_id

# Obtiene un proyecto si no lanza Error 404 
def _get_project_or_404(
    session: Session,
    project_id: int,
    tenant_id: Optional[int],
) -> Project:
    # Recupera el proyecto por ID --> Si no existe error, Si existe pero no pertenece al tenant error
    project = session.get(Project, project_id)
    # Proyecto no encontrado
    if not project:
        raise ValueError("Proyecto no encontrado.")
    
    # Aislamiento multi-tenant:
    # evita acceder a proyectos de otros tenants
    if tenant_id is not None and project.tenant_id != tenant_id:
        raise ValueError("Proyecto no encontrado.")
    return project


def _resolve_department(
    session: Session,
    department_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[Department]:
    if department_id is None:
        return None
    dept = session.get(Department, department_id)
    if not dept:
        raise ValueError("Departamento no encontrado.")
    if tenant_id is not None and dept.tenant_id != tenant_id:
        raise ValueError("El departamento no pertenece al tenant.")
    return dept

# Convierte una fecha a timezone-aware (UTC)
def _as_aware(value: datetime) -> datetime:
    # Si en native se asume --> UTC , Si ya tiene tzinfo se devuelta tal cual 
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

# Lista proyectos activos
def list_projects(session: Session, tenant_id: Optional[int]) -> list[Project]:
    #Devuelve todos los proyectos activos
        # si hay tenant_id --> solo para proyectos de ese tenant
        # si no hay tenant_id --> todos los proyectos(admin)
        
    # Query base: solo para los proyectos activos    
    stmt = select(Project).where(Project.is_active.is_(True))
    # Filtro multi-tenat (aislamiento de datos)
    if tenant_id is not None:
        stmt = stmt.where(Project.tenant_id == tenant_id)
    # Ordena por fecha de creación descendente
    return session.exec(stmt.order_by(Project.created_at.desc())).all()

# Obtiene un proyecto concreto
def get_project(session: Session, project_id: int, tenant_id: Optional[int]) -> Project:
    #Devuelve un proyecto por ID aplicando control de tenant.
    return _get_project_or_404(session, project_id, tenant_id)

# Lista tareas no eliminadas
def list_tasks(session: Session, tenant_id: Optional[int]) -> list[Task]:
    #Devuelve todas las tareas que no están marcadas como eliminadas.
        #Excluye estado 'deleted'.
        #Aplica filtro por tenant si existe.
        
    # Query base: tareas activas (no eliminadas)    
    stmt = select(Task).where(Task.status != "deleted")
     # Aislamiento multi-tenant
    if tenant_id is not None:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    # Orden por creación descendente
    return session.exec(stmt.order_by(Task.created_at.desc())).all()

# Valida presupuestos de hitos
def _validate_budget_totals(
    *,
    hito1_budget: Decimal,
    hito2_budget: Decimal,
    approved_budget: Decimal,
) -> None:
    #Valida que la suma de los presupuestos de los hitos
    #No supere el presupuesto aprobado del proyecto.
    
    # Suma total de los hitos 
    total = hito1_budget + hito2_budget
    
    # Regla de negocio: no se puede exceder el presupuesto aprobado
    if total > approved_budget:
        raise ValueError(
            "La suma de los hitos no puede superar el presupuesto aprobado."
        )


def _validate_budget_milestones_totals(
    *,
    total_amount: Decimal,
    total_justified: Decimal,
    approved_budget: Decimal,
) -> None:
    if total_amount > approved_budget:
        raise ValueError(
            "La suma de los hitos no puede superar el presupuesto aprobado."
        )
    # El total justificado tampoco puede superar el presupuesto aprobado.
    if total_justified > approved_budget:
        raise ValueError(
            "El justificado total no puede superar el presupuesto aprobado."
        )

# Lista líneas de presupuesto de un proyecto
def list_project_budget_lines(
    session: Session, project_id: int, tenant_id: Optional[int]
) -> tuple[list[ProjectBudgetLine], dict[int, list[BudgetLineMilestone]]]:
    """
    Devuelve las líneas de presupuesto de un proyecto
    junto con sus hitos asociados.

    Retorna:
    - Lista de líneas de presupuesto.
    - Diccionario: line_id → lista de hitos asociados.
    """
     # Verifica que el proyecto exista y pertenezca al tenant
    _get_project_or_404(session, project_id, tenant_id)
     # Obtiene las líneas de presupuesto del proyecto
    lines = session.exec(
        select(ProjectBudgetLine)
        .where(ProjectBudgetLine.project_id == project_id)
        .order_by(ProjectBudgetLine.created_at.asc()),
    ).all()
    # Adjunta los hitos a cada línea de presupuesto
    return _attach_line_milestones(session, lines, tenant_id)

# Lista hitos de presupuesto de un proyecto
def list_project_budget_milestones(
    session: Session, project_id: int, tenant_id: Optional[int]
) -> list[ProjectBudgetMilestone]:
    #Devuelve todos los hitos de presupuesto de un proyecto
    #ordenados por su posición lógica.
    
     # Verifica acceso y pertenencia al proyecto
    _get_project_or_404(session, project_id, tenant_id)
    # Obtiene los hitos ordenados por orden visual y por ID
    return session.exec(
        select(ProjectBudgetMilestone)
        .where(ProjectBudgetMilestone.project_id == project_id)
        .order_by(ProjectBudgetMilestone.order_index.asc(), ProjectBudgetMilestone.id.asc())
    ).all()

# Crea un hito de presupuesto para un proyecto
def create_project_budget_milestone(
    session: Session, project_id: int, data: ProjectBudgetMilestoneCreate, tenant_id: Optional[int]
) -> ProjectBudgetMilestone:
    """
    Crea un nuevo hito de presupuesto asociado a un proyecto.

    - Valida acceso al proyecto.
    - Asigna tenant automáticamente desde el proyecto.
    - Inicializa nombre y orden del hito.
    """
    # Obtiene el proyecto y valida pertenencia al tenant
    project = _get_project_or_404(session, project_id, tenant_id)
     # Crea la entidad del hito
    milestone = ProjectBudgetMilestone(
        project_id=project_id,
        tenant_id=project.tenant_id, # Asegura el aislamiento multi-tenant
        name=data.name.strip() or "Hito",# Nombre por defecto si viene vacio
        order_index=data.order_index or 0, # Orden visual del hito 
    )
    #Persiste el hito en la bd
    session.add(milestone)
    session.commit()
    #Refresca para obtener el ID y campos autogenerados
    session.refresh(milestone)
    return milestone

# Actualiza un hito de presupuesto existente 
def update_project_budget_milestone(
    session: Session,
    project_id: int,
    milestone_id: int,
    data: ProjectBudgetMilestoneUpdate,
    tenant_id: Optional[int],
) -> ProjectBudgetMilestone:
    _get_project_or_404(session, project_id, tenant_id)
    milestone = session.get(ProjectBudgetMilestone, milestone_id)
    if not milestone or milestone.project_id != project_id:
        raise ValueError("Hito de presupuesto no encontrado.")
    if data.name is not None:
        milestone.name = data.name.strip() or milestone.name
    if data.order_index is not None:
        milestone.order_index = data.order_index
    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone

# Elimina un hito de presupuesto de un proyecto
def delete_project_budget_milestone(
    session: Session, project_id: int, milestone_id: int, tenant_id: Optional[int]
) -> None:
    """
    Elimina un hito de presupuesto y todas sus relaciones asociadas.
    Pasos:
    1. Verifica que el proyecto exista y pertenezca al tenant.
    2. Comprueba que el hito exista y sea del proyecto.
    3. Elimina las relaciones hito ↔ líneas de presupuesto.
    4. Elimina el hito.
    5. Confirma la transacción.
    
    """
     # Verificación de acceso al proyecto (multi-tenant)
    _get_project_or_404(session, project_id, tenant_id)
    # Obtiene el hito por ID
    milestone = session.get(ProjectBudgetMilestone, milestone_id)
    # Valida existencia y pertenencia al proyecto
    if not milestone or milestone.project_id != project_id:
        raise ValueError("Hito de presupuesto no encontrado.")
    # Busca todas las relaciones entre el hito y las líneas de presupuesto
    line_links = session.exec(
        select(BudgetLineMilestone).where(BudgetLineMilestone.milestone_id == milestone_id)).all()
    # Elimina cada relación para mantener integridad referencial
    for link in line_links:
        session.delete(link)
    # Elimina el hito de presupuesto
    session.delete(milestone)
     # Confirma los cambios en base de datos
    session.commit()


def _attach_line_milestones(
    session: Session,
    lines: list[ProjectBudgetLine],
    tenant_id: Optional[int],
) -> tuple[list[ProjectBudgetLine], dict[int, list[BudgetLineMilestone]]]:
    if not lines:
        return lines, {}
    line_ids = [line.id for line in lines if line.id is not None]
    if not line_ids:
        return lines, {}
    project_id = lines[0].project_id
    milestones = {
        m.id: m for m in list_project_budget_milestones(session, project_id, tenant_id)
    }
    links = session.exec(
        select(BudgetLineMilestone).where(BudgetLineMilestone.budget_line_id.in_(line_ids))
    ).all()
    links_by_line: dict[int, list[BudgetLineMilestone]] = {}
    for link in links:
        links_by_line.setdefault(link.budget_line_id, []).append(link)

    # ordenamos los enlaces por order_index para cada linea


    sorted_links: dict[int, list[BudgetLineMilestone]] = {}
    for line_id, mlinks in links_by_line.items():
        mlinks_sorted = sorted(
            mlinks,
            key=lambda l: milestones.get(l.milestone_id).order_index if milestones.get(l.milestone_id) else 0,
        )
        sorted_links[line_id] = mlinks_sorted
    return lines, sorted_links


def create_project_budget_line(
    session: Session,
    project_id: int,
    data: ProjectBudgetLineCreate,
    tenant_id: Optional[int],
) -> ProjectBudgetLine:
    project = _get_project_or_404(session, project_id, tenant_id)
    # Si vienen hitos dinámicos, recalculamos totales pero el presupuesto aprobado
    # lo decide el usuario y los hitos no pueden superarlo.
    milestones_payload: list[BudgetLineMilestoneCreate] = data.milestones or []
    if milestones_payload:
        total_amount = sum(Decimal(m.amount) for m in milestones_payload)
        total_justified = sum(Decimal(m.justified) for m in milestones_payload)
        approved_budget = data.approved_budget
        if approved_budget is None:
            approved_budget = total_amount
        _validate_budget_milestones_totals(
            total_amount=total_amount,
            total_justified=total_justified,
            approved_budget=approved_budget,
        )
        percent_spent = Decimal(0)
        if approved_budget and approved_budget != 0:
            percent_spent = (total_justified / approved_budget) * Decimal(100)
        line = ProjectBudgetLine(
            project_id=project_id,
            tenant_id=project.tenant_id,
            concept=data.concept.strip() or "Concepto",
            hito1_budget=milestones_payload[0].amount if len(milestones_payload) > 0 else Decimal(0),
            justified_hito1=milestones_payload[0].justified if len(milestones_payload) > 0 else Decimal(0),
            hito2_budget=milestones_payload[1].amount if len(milestones_payload) > 1 else Decimal(0),
            justified_hito2=milestones_payload[1].justified if len(milestones_payload) > 1 else Decimal(0),
            approved_budget=approved_budget,
            percent_spent=percent_spent,
            forecasted_spent=data.forecasted_spent,
        )
        session.add(line)
        session.commit()
        session.refresh(line)
        for m in milestones_payload:
            link = BudgetLineMilestone(
                budget_line_id=line.id,
                milestone_id=m.milestone_id,
                tenant_id=project.tenant_id,
                amount=m.amount,
                justified=m.justified,
            )
            session.add(link)
        session.commit()
        return line

    # Sin hitos dinámicos: el presupuesto aprobado lo decide el usuario, pero
    # la suma de HITO1 + HITO2 no puede superarlo.
    total_amount = Decimal(data.hito1_budget) + Decimal(data.hito2_budget)
    approved_budget = data.approved_budget
    if approved_budget is None:
        approved_budget = total_amount
    _validate_budget_totals(
        hito1_budget=data.hito1_budget,
        hito2_budget=data.hito2_budget,
        approved_budget=approved_budget,
    )
    total_justified = Decimal(data.justified_hito1) + Decimal(data.justified_hito2)
    percent_spent = Decimal(0)
    if approved_budget and approved_budget != 0:
        percent_spent = (total_justified / approved_budget) * Decimal(100)
    line = ProjectBudgetLine(
        project_id=project_id,
        tenant_id=project.tenant_id,
        concept=data.concept.strip() or "Concepto",
        hito1_budget=data.hito1_budget,
        justified_hito1=data.justified_hito1,
        hito2_budget=data.hito2_budget,
        justified_hito2=data.justified_hito2,
        approved_budget=approved_budget,
        percent_spent=percent_spent,
        forecasted_spent=data.forecasted_spent,
    )
    session.add(line)
    session.commit()
    session.refresh(line)
    return line


def update_project_budget_line(
    session: Session,
    project_id: int,
    budget_id: int,
    data: ProjectBudgetLineUpdate,
    tenant_id: Optional[int],
) -> ProjectBudgetLine:
    _get_project_or_404(session, project_id, tenant_id)
    line = session.get(ProjectBudgetLine, budget_id)
    if not line or line.project_id != project_id:
        # Si la línea no existe, hacemos upsert creando una nueva.
        if data.concept is None:
            raise ValueError("Presupuesto no encontrado para el proyecto.")
        h1 = Decimal(data.hito1_budget or 0)
        h2 = Decimal(data.hito2_budget or 0)
        j1 = Decimal(data.justified_hito1 or 0)
        j2 = Decimal(data.justified_hito2 or 0)
        approved_budget = (
            Decimal(data.approved_budget)
            if data.approved_budget is not None
            else h1 + h2
        )
        total_justified = j1 + j2
        percent_spent = (
            (total_justified / approved_budget * Decimal(100))
            if approved_budget
            else Decimal(0)
        )
        forecasted_spent = Decimal(data.forecasted_spent or 0)
        create_payload = ProjectBudgetLineCreate(
            concept=data.concept.strip() or "Concepto",
            hito1_budget=h1,
            justified_hito1=j1,
            hito2_budget=h2,
            justified_hito2=j2,
            approved_budget=approved_budget,
            percent_spent=percent_spent,
            forecasted_spent=forecasted_spent,
            milestones=data.milestones,
        )
        return create_project_budget_line(session, project_id, create_payload, tenant_id)

    milestones_payload: list[BudgetLineMilestoneCreate] = data.milestones or []
    if milestones_payload:
        # Recalcula totales desde hitos; el presupuesto aprobado lo decide el usuario
        # y los hitos no pueden superarlo.
        total_amount = sum(Decimal(m.amount) for m in milestones_payload)
        total_justified = sum(Decimal(m.justified) for m in milestones_payload)
        approved_budget = data.approved_budget if data.approved_budget is not None else line.approved_budget
        if approved_budget is None:
            approved_budget = total_amount
        _validate_budget_milestones_totals(
            total_amount=total_amount,
            total_justified=total_justified,
            approved_budget=approved_budget,
        )
        line.hito1_budget = milestones_payload[0].amount if len(milestones_payload) > 0 else Decimal(0)
        line.justified_hito1 = milestones_payload[0].justified if len(milestones_payload) > 0 else Decimal(0)
        line.hito2_budget = milestones_payload[1].amount if len(milestones_payload) > 1 else Decimal(0)
        line.justified_hito2 = milestones_payload[1].justified if len(milestones_payload) > 1 else Decimal(0)
        line.approved_budget = approved_budget
        line.percent_spent = (
            (total_justified / approved_budget * Decimal(100)) if approved_budget else Decimal(0)
        )
        if data.forecasted_spent is not None:
            line.forecasted_spent = data.forecasted_spent
        # Reemplaza enlaces existentes.
        existing_links = session.exec(
            select(BudgetLineMilestone).where(BudgetLineMilestone.budget_line_id == line.id)
        ).all()
        for link in existing_links:
            session.delete(link)
        session.commit()
        for m in milestones_payload:
            link = BudgetLineMilestone(
                budget_line_id=line.id,
                milestone_id=m.milestone_id,
                tenant_id=line.tenant_id,
                amount=m.amount,
                justified=m.justified,
            )
            session.add(link)
        session.commit()
        line.milestones = session.exec(
            select(BudgetLineMilestone).where(BudgetLineMilestone.budget_line_id == line.id)
        ).all()
        session.refresh(line)
        return line

    hito1_budget = data.hito1_budget if data.hito1_budget is not None else line.hito1_budget
    hito2_budget = data.hito2_budget if data.hito2_budget is not None else line.hito2_budget
    # Presupuesto aprobado decidido por el usuario; la suma de hitos no puede superarlo.
    approved_budget = data.approved_budget if data.approved_budget is not None else line.approved_budget
    if approved_budget is None:
        approved_budget = hito1_budget + hito2_budget

    _validate_budget_totals(
        hito1_budget=hito1_budget,
        hito2_budget=hito2_budget,
        approved_budget=approved_budget,
    )

    if data.concept is not None:
        line.concept = data.concept.strip() or line.concept
    if data.hito1_budget is not None:
        line.hito1_budget = data.hito1_budget
    if data.justified_hito1 is not None:
        line.justified_hito1 = data.justified_hito1
    if data.hito2_budget is not None:
        line.hito2_budget = data.hito2_budget
    if data.justified_hito2 is not None:
        line.justified_hito2 = data.justified_hito2
    # Sin hitos dinámicos, mantenemos approved_budget consistente con la regla
    # de validación pero editable por el usuario.
    line.approved_budget = approved_budget
    # Recalcula % gasto en base al total justificado de la línea.
    total_justified_line = Decimal(line.justified_hito1 or 0) + Decimal(line.justified_hito2 or 0)
    line.percent_spent = (
        (total_justified_line / approved_budget * Decimal(100)) if approved_budget else Decimal(0)
    )
    if data.forecasted_spent is not None:
        line.forecasted_spent = data.forecasted_spent

    session.add(line)
    session.commit()
    session.refresh(line)
    return line


def delete_project_budget_line(
    session: Session, project_id: int, budget_id: int, tenant_id: Optional[int]
) -> None:
    _get_project_or_404(session, project_id, tenant_id)
    line = session.get(ProjectBudgetLine, budget_id)
    if not line or line.project_id != project_id:
        raise ValueError("Presupuesto no encontrado para el proyecto.")
    links = session.exec(
        select(BudgetLineMilestone).where(BudgetLineMilestone.budget_line_id == budget_id)
    ).all()
    for link in links:
        session.delete(link)
    session.delete(line)
    session.commit()


def create_project(session: Session, data: ProjectCreate, tenant_id: Optional[int]) -> Project:
    tenant_id = _require_tenant(tenant_id)
    _validate_date_range(data.start_date, data.end_date)
    project_type = _normalize_project_type(data.project_type)
    department = _resolve_department(session, data.department_id, tenant_id)
    project = Project(
        tenant_id=tenant_id,
        department_id=department.id if department else None,
        name=data.name,
        description=data.description,
        project_type=project_type,
        start_date=data.start_date,
        end_date=data.end_date,
        duration_months=_calculate_duration_months(data.start_date, data.end_date),
        loan_percent=Decimal(_clamp_percent(data.loan_percent) or 0)
        if data.loan_percent is not None
        else None,
        subsidy_percent=Decimal(_clamp_percent(data.subsidy_percent) or 0)
        if data.subsidy_percent is not None
        else None,
        is_active=data.is_active,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def update_project(
    session: Session, project_id: int, data: ProjectUpdate, tenant_id: Optional[int]
) -> Project:
    project = _get_project_or_404(session, project_id, tenant_id)

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.project_type is not None:
        project.project_type = _normalize_project_type(data.project_type)
    if "department_id" in data.__fields_set__:
        if data.department_id is None:
            project.department_id = None
        else:
            department = _resolve_department(
                session, data.department_id, project.tenant_id
            )
            project.department_id = department.id if department else None
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else project.start_date
        end_date = data.end_date if data.end_date is not None else project.end_date
        _validate_date_range(start_date, end_date)
        project.start_date = start_date
        project.end_date = end_date
    if data.loan_percent is not None:
        project.loan_percent = Decimal(_clamp_percent(data.loan_percent) or 0)
    if data.subsidy_percent is not None:
        project.subsidy_percent = Decimal(_clamp_percent(data.subsidy_percent) or 0)
    if data.is_active is not None:
        project.is_active = data.is_active
    if "latitude" in data.__fields_set__:
        project.latitude = data.latitude
    if "longitude" in data.__fields_set__:
        project.longitude = data.longitude

    if project.start_date and project.end_date:
        project.duration_months = _calculate_duration_months(
            project.start_date, project.end_date
        )
    else:
        project.duration_months = None

    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def delete_project(session: Session, project_id: int, tenant_id: Optional[int]) -> None:
    """Soft-delete de proyecto (is_active = False) para evitar problemas de FK."""
    project = _get_project_or_404(session, project_id, tenant_id)
    project.is_active = False
    session.add(project)
    session.commit()

def _resolve_assignee(session: Session, current_user: User, assigned_to_id: Optional[int]) -> Optional[User]:
    if assigned_to_id is None:
        return None

    assignee = session.get(User, assigned_to_id)
    if not assignee:
        raise ValueError("Usuario asignado no encontrado.")

    if not current_user.is_super_admin:
        if not current_user.tenant_id:
            raise ValueError("El usuario no tiene tenant asociado.")
        if assignee.tenant_id != current_user.tenant_id:
            raise ValueError("El usuario asignado no pertenece a tu tenant.")

    return assignee


def _normalize_task_status(
    status: Optional[str],
    is_completed: Optional[bool],
) -> str:
    if status:
        normalized = status.strip().lower()
        if normalized not in TASK_STATUSES:
            raise ValueError("Estado de tarea no valido.")
        return normalized
    if is_completed:
        return "done"
    return "pending"


def _validate_date_range(start_date: Optional[datetime], end_date: Optional[datetime]) -> None:
    # Evita rangos inconsistentes en proyectos/tareas.
    if start_date and end_date and end_date < start_date:
        raise ValueError("La fecha de fin debe ser posterior a la de inicio.")


def _normalize_project_type(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    if not cleaned:
        return None
    allowed = {"regional", "nacional", "internacional"}
    if cleaned not in allowed:
        raise ValueError("Tipo de proyecto no válido")
    return cleaned

def _calculate_duration_months(
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Optional[int]:
    if not start_date or not end_date:
        return None
    start = start_date.date()
    end = end_date.date()
    if end < start:
        return None
    total_days = (end - start).days + 1
    return max(1, ceil(total_days / 30))

def _clamp_percent(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(100.0, num))



def _resolve_activity(
    session: Session,
    project_id: Optional[int],
    activity_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[Activity]:
    if activity_id is None:
        return None
    activity = session.get(Activity, activity_id)
    if not activity:
        raise ValueError("Actividad no encontrada.")
    if tenant_id is not None and activity.tenant_id != tenant_id:
        raise ValueError("Actividad no encontrada.")
    if project_id and activity.project_id != project_id:
        raise ValueError("La actividad no pertenece al proyecto indicado.")
    return activity


def _resolve_subactivity(
    session: Session,
    project_id: Optional[int],
    subactivity_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[SubActivity]:
    if subactivity_id is None:
        return None
    subactivity = session.get(SubActivity, subactivity_id)
    if not subactivity:
        raise ValueError("Subactividad no encontrada.")
    if tenant_id is not None and subactivity.tenant_id != tenant_id:
        raise ValueError("Subactividad no encontrada.")
    activity = session.get(Activity, subactivity.activity_id)
    if not activity:
        raise ValueError("Actividad asociada no encontrada.")
    if project_id and activity.project_id != project_id:
        raise ValueError("La subactividad no pertenece al proyecto indicado.")
    return subactivity


def _resolve_task_template(
    session: Session,
    task_template_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[TaskTemplate]:
    if task_template_id is None:
        return None
    template = session.get(TaskTemplate, task_template_id)
    if not template:
        raise ValueError("Plantilla de tarea no encontrada.")
    if tenant_id is not None and template.tenant_id != tenant_id:
        raise ValueError("Plantilla de tarea no encontrada.")
    if not template.is_active:
        raise ValueError("La plantilla de tarea no esta activa.")
    return template


def _resolve_milestone(
    session: Session,
    milestone_id: int,
    tenant_id: Optional[int],
) -> Milestone:
    milestone = session.get(Milestone, milestone_id)
    if not milestone:
        raise ValueError("Hito no encontrado.")
    if tenant_id is not None and milestone.tenant_id != tenant_id:
        raise ValueError("Hito no encontrado.")
    return milestone


def create_task(
    session: Session,
    current_user: User,
    data: TaskCreate,
    tenant_id: Optional[int],
) -> Task:
    tenant_context = tenant_id
    project_id = data.project_id
    project = None
    if project_id is not None:
        project = _get_project_or_404(session, project_id, tenant_context)
        tenant_context = tenant_context or project.tenant_id

    # Resolver dependencias jerarquicas si se proporcionan.
    subactivity = _resolve_subactivity(session, project_id, data.subactivity_id, tenant_context)
    if subactivity:
        activity = session.get(Activity, subactivity.activity_id)
        if activity and not project_id:
            project_id = activity.project_id
    _resolve_task_template(session, data.task_template_id, tenant_id)

    assignee = _resolve_assignee(session, current_user, data.assigned_to_id)
    _validate_date_range(data.start_date, data.end_date)

    effective_tenant_id = project.tenant_id if project else tenant_context
    status = _normalize_task_status(data.status, data.is_completed)
    task = Task(
        tenant_id=_optional_tenant(effective_tenant_id),
        project_id=project_id,
        subactivity_id=data.subactivity_id,
        task_template_id=data.task_template_id,
        title=data.title,
        description=data.description,
        assigned_to_id=assignee.id if assignee else None,
        start_date=data.start_date,
        end_date=data.end_date,
        status=status,
        is_completed=status == "done",
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    if assignee and assignee.tenant_id:
        create_notification(
            session,
            tenant_id=assignee.tenant_id,
            user_id=assignee.id,
            type=NotificationType.GENERIC,
            title=f"Tarea asignada: {task.title}",
            body="Se te ha asignado una nueva tarea en el ERP.",
            reference=f"task_id={task.id}",
        )

    return task


def update_task(
    session: Session,
    current_user: User,
    task_id: int,
    data: TaskUpdate,
    tenant_id: Optional[int],
) -> Task:
    task = session.get(Task, task_id)
    if not task or (tenant_id is not None and task.tenant_id != tenant_id):
        raise ValueError("Tarea no encontrada.")

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.project_id is not None:
        project = _get_project_or_404(session, data.project_id, tenant_id)
        task.project_id = data.project_id
        task.tenant_id = project.tenant_id
    if data.subactivity_id is not None:
        _resolve_subactivity(session, task.project_id, data.subactivity_id, tenant_id)
        task.subactivity_id = data.subactivity_id
    if data.task_template_id is not None:
        _resolve_task_template(session, data.task_template_id, tenant_id)
        task.task_template_id = data.task_template_id
    if data.status is not None:
        status = _normalize_task_status(data.status, None)
        task.status = status
        task.is_completed = status == "done"
    elif data.is_completed is not None:
        task.is_completed = data.is_completed
        task.status = "done" if data.is_completed else "pending"
    if data.assigned_to_id is not None:
        assignee = _resolve_assignee(session, current_user, data.assigned_to_id)
        task.assigned_to_id = assignee.id if assignee else None
        if assignee and assignee.tenant_id:
            create_notification(
                session,
                tenant_id=assignee.tenant_id,
                user_id=assignee.id,
                type=NotificationType.GENERIC,
                title=f"Tarea asignada: {task.title}",
                body="Se te ha asignado una nueva tarea en el ERP.",
                reference=f"task_id={task.id}",
            )

    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else task.start_date
        end_date = data.end_date if data.end_date is not None else task.end_date
        _validate_date_range(start_date, end_date)
        task.start_date = start_date
        task.end_date = end_date

    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def delete_task(session: Session, task_id: int, tenant_id: Optional[int]) -> None:
    task = session.get(Task, task_id)
    if not task or (tenant_id is not None and task.tenant_id != tenant_id):
        raise ValueError("Tarea no encontrada.")
    # Soft delete: marca la tarea como eliminada para que no aparezca en los listados.
    task.status = "deleted"
    task.is_completed = True
    task.subactivity_id = None
    session.add(task)
    session.commit()


def list_task_templates(session: Session, tenant_id: Optional[int]) -> list[TaskTemplate]:
    stmt = select(TaskTemplate)
    if tenant_id is not None:
        stmt = stmt.where(TaskTemplate.tenant_id == tenant_id)
    return session.exec(stmt.order_by(TaskTemplate.created_at.desc())).all()


def create_task_template(
    session: Session, data: TaskTemplateCreate, tenant_id: Optional[int]
) -> TaskTemplate:
    tenant_id = _require_tenant(tenant_id)
    template = TaskTemplate(
        tenant_id=tenant_id,
        title=data.title,
        description=data.description,
        is_active=data.is_active,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def list_activities(
    session: Session, tenant_id: Optional[int], project_id: Optional[int] = None
) -> list[Activity]:
    stmt = select(Activity)
    if tenant_id is not None:
        stmt = stmt.where(Activity.tenant_id == tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Activity.project_id == project_id)
    return session.exec(stmt.order_by(Activity.created_at.desc())).all()


def create_activity(
    session: Session, data: ActivityCreate, tenant_id: Optional[int]
) -> Activity:
    project = _get_project_or_404(session, data.project_id, tenant_id)
    _validate_date_range(data.start_date, data.end_date)
    activity = Activity(
        tenant_id=project.tenant_id,
        project_id=data.project_id,
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        assigned_to_id=data.assigned_to_id,
    )
    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


def update_activity(
    session: Session, activity_id: int, data: ActivityUpdate, tenant_id: Optional[int]
) -> Activity:
    activity = session.get(Activity, activity_id)
    if not activity or (tenant_id is not None and activity.tenant_id != tenant_id):
        raise ValueError("Actividad no encontrada.")

    if data.name is not None:
        activity.name = data.name
    if data.description is not None:
        activity.description = data.description
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else activity.start_date
        end_date = data.end_date if data.end_date is not None else activity.end_date
        _validate_date_range(start_date, end_date)
        activity.start_date = start_date
        activity.end_date = end_date
    if data.assigned_to_id is not None:
        activity.assigned_to_id = data.assigned_to_id

    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


def list_subactivities(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[SubActivity]:
    stmt = select(SubActivity)
    if tenant_id is not None:
        stmt = stmt.where(SubActivity.tenant_id == tenant_id)
    if activity_id is not None:
        activity = _resolve_activity(session, project_id, activity_id, tenant_id)
        if activity:
            stmt = stmt.where(SubActivity.activity_id == activity_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = (
            stmt.join(Activity, Activity.id == SubActivity.activity_id)
            .where(Activity.project_id == project_id)
        )
    return session.exec(stmt.order_by(SubActivity.created_at.desc())).all()


def create_subactivity(
    session: Session, data: SubActivityCreate, tenant_id: Optional[int]
) -> SubActivity:
    activity = _resolve_activity(session, None, data.activity_id, tenant_id)
    if not activity:
        raise ValueError("Actividad no encontrada.")
    _validate_date_range(data.start_date, data.end_date)
    subactivity = SubActivity(
        tenant_id=activity.tenant_id,
        activity_id=data.activity_id,
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        assigned_to_id=data.assigned_to_id,
    )
    session.add(subactivity)
    session.commit()
    session.refresh(subactivity)
    return subactivity


def update_subactivity(
    session: Session, subactivity_id: int, data: SubActivityUpdate, tenant_id: Optional[int]
) -> SubActivity:
    subactivity = session.get(SubActivity, subactivity_id)
    if not subactivity or (tenant_id is not None and subactivity.tenant_id != tenant_id):
        raise ValueError("Subactividad no encontrada.")

    if data.name is not None:
        subactivity.name = data.name
    if data.description is not None:
        subactivity.description = data.description
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else subactivity.start_date
        end_date = data.end_date if data.end_date is not None else subactivity.end_date
        _validate_date_range(start_date, end_date)
        subactivity.start_date = start_date
        subactivity.end_date = end_date
    if data.assigned_to_id is not None:
        subactivity.assigned_to_id = data.assigned_to_id

    session.add(subactivity)
    session.commit()
    session.refresh(subactivity)
    return subactivity


def list_milestones(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[Milestone]:
    stmt = select(Milestone)
    if tenant_id is not None:
        stmt = stmt.where(Milestone.tenant_id == tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Milestone.project_id == project_id)
    if activity_id is not None:
        stmt = stmt.where(Milestone.activity_id == activity_id)
    return session.exec(stmt.order_by(Milestone.created_at.desc())).all()


def create_milestone(
    session: Session, data: MilestoneCreate, tenant_id: Optional[int]
) -> Milestone:
    project = _get_project_or_404(session, data.project_id, tenant_id)
    _resolve_activity(session, data.project_id, data.activity_id, tenant_id)
    milestone = Milestone(
        tenant_id=project.tenant_id,
        project_id=data.project_id,
        activity_id=data.activity_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        allow_late_submission=data.allow_late_submission,
    )
    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone


def update_milestone(
    session: Session, milestone_id: int, data: MilestoneUpdate, tenant_id: Optional[int]
) -> Milestone:
    milestone = session.get(Milestone, milestone_id)
    if not milestone or (tenant_id is not None and milestone.tenant_id != tenant_id):
        raise ValueError("Hito no encontrado.")

    if data.title is not None:
        milestone.title = data.title
    if data.description is not None:
        milestone.description = data.description
    if data.due_date is not None:
        milestone.due_date = data.due_date
    if data.allow_late_submission is not None:
        milestone.allow_late_submission = data.allow_late_submission

    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone


def list_deliverables(
    session: Session,
    tenant_id: Optional[int],
    milestone_id: Optional[int] = None,
) -> list[Deliverable]:
    stmt = select(Deliverable)
    if tenant_id is not None:
        stmt = stmt.where(Deliverable.tenant_id == tenant_id)
    if milestone_id is not None:
        _resolve_milestone(session, milestone_id, tenant_id)
        stmt = stmt.where(Deliverable.milestone_id == milestone_id)
    return session.exec(stmt.order_by(Deliverable.created_at.desc())).all()


def create_deliverable(
    session: Session, data: DeliverableCreate, tenant_id: Optional[int]
) -> Deliverable:
    milestone = _resolve_milestone(session, data.milestone_id, tenant_id)
    submitted_at = _as_aware(data.submitted_at or datetime.now(timezone.utc))
    is_late = False
    if milestone.due_date and submitted_at > _as_aware(milestone.due_date):
        is_late = True
        if not milestone.allow_late_submission:
            raise ValueError("Entrega fuera de plazo para este hito.")

    deliverable = Deliverable(
        tenant_id=milestone.tenant_id,
        milestone_id=data.milestone_id,
        title=data.title,
        notes=data.notes,
        link_url=data.link_url,
        file_id=data.file_id,
        submitted_at=submitted_at,
        is_late=is_late,
    )
    session.add(deliverable)
    session.commit()
    session.refresh(deliverable)
    return deliverable


def update_deliverable(
    session: Session, deliverable_id: int, data: DeliverableUpdate, tenant_id: Optional[int]
) -> Deliverable:
    deliverable = session.get(Deliverable, deliverable_id)
    if not deliverable or (tenant_id is not None and deliverable.tenant_id != tenant_id):
        raise ValueError("Entregable no encontrado.")

    if data.title is not None:
        deliverable.title = data.title
    if data.notes is not None:
        deliverable.notes = data.notes
    if data.link_url is not None:
        deliverable.link_url = data.link_url
    if data.file_id is not None:
        deliverable.file_id = data.file_id
    if data.submitted_at is not None:
        deliverable.submitted_at = _as_aware(data.submitted_at)

    milestone = _resolve_milestone(session, deliverable.milestone_id, tenant_id)
    if deliverable.submitted_at and milestone.due_date:
        deliverable.is_late = _as_aware(deliverable.submitted_at) > _as_aware(
            milestone.due_date,
        )
        if deliverable.is_late and not milestone.allow_late_submission:
            raise ValueError("Entrega fuera de plazo para este hito.")
    else:
        deliverable.is_late = False

    session.add(deliverable)
    session.commit()
    session.refresh(deliverable)
    return deliverable


def get_active_time_session(
    session: Session, user: User, tenant_id: Optional[int]
) -> Optional[TimeSession]:
    stmt = select(TimeSession).where(
        TimeSession.user_id == user.id,
        TimeSession.is_active.is_(True),
    )
    if tenant_id is not None:
        stmt = stmt.where(TimeSession.tenant_id == tenant_id)
    return session.exec(stmt.order_by(TimeSession.started_at.desc())).one_or_none()


def start_time_session(
    session: Session,
    user: User,
    task_id: Optional[int],
    tenant_id: Optional[int],
    payload_tenant_id: Optional[int] = None,
) -> TimeSession:
    if payload_tenant_id is not None and not user.is_super_admin:
        if user.tenant_id is None or payload_tenant_id != user.tenant_id:
            raise ValueError(
                "No tienes permisos para iniciar sesiones para otros tenants."
            )

    task: Optional[Task] = None
    if task_id is not None:
        task = session.get(Task, task_id)
        if not task:
            raise ValueError("Tarea no encontrada")

    # Resuelve el tenant: payload > parámetro header > tenant de la tarea > tenant del usuario
    resolved_tenant_id = payload_tenant_id or tenant_id or (task.tenant_id if task else None) or user.tenant_id
    if resolved_tenant_id is None:
        raise ValueError("Tenant requerido para iniciar una sesión sin tarea.")
    
    # Valida que la tarea pertenezca al tenant especificado (si ambos existen)
    if task and task.tenant_id is not None and resolved_tenant_id is not None and task.tenant_id != resolved_tenant_id:
        raise ValueError("Tarea no encontrada")

    active = get_active_time_session(session, user, resolved_tenant_id)
    now = datetime.now(timezone.utc)

    if active:
        active_ended = _as_aware(active.ended_at or now)
        active_started = _as_aware(active.started_at)
        active.ended_at = active_ended
        delta = active_ended - active_started
        active.duration_seconds = max(0, int(delta.total_seconds()))
        active.is_active = False
        session.add(active)

        if active.task_id is not None:
            hours_decimal = Decimal(active.duration_seconds) / Decimal(3600)
            hours_decimal = hours_decimal.quantize(Decimal("0.01"))
            session.add(
                TimeEntry(
                    tenant_id=active.tenant_id,
                    task_id=active.task_id,
                    user_id=user.id,
                    time_session_id=active.id,
                    hours=hours_decimal,
                    description="Generado automaticamente desde control de tiempo",
                    created_at=now,
                ),
            )

    new_session = TimeSession(
        tenant_id=resolved_tenant_id,
        task_id=task_id,
        user_id=user.id,
        started_at=now,
        ended_at=None,
        duration_seconds=0,
        is_active=True,
        created_at=now,
    )
    session.add(new_session)
    session.commit()
    session.refresh(new_session)
    return new_session


def stop_time_session(
    session: Session, user: User, tenant_id: Optional[int]
) -> Optional[TimeSession]:
    active = get_active_time_session(session, user, tenant_id)
    if not active:
        return None

    now = datetime.now(timezone.utc)
    active_started = _as_aware(active.started_at)
    active_ended = _as_aware(now)
    active.ended_at = active_ended
    delta = active_ended - active_started
    active.duration_seconds = max(0, int(delta.total_seconds()))
    active.is_active = False
    session.add(active)

    if active.task_id is not None:
        hours_decimal = Decimal(active.duration_seconds) / Decimal(3600)
        hours_decimal = hours_decimal.quantize(Decimal("0.01"))
        session.add(
            TimeEntry(
                tenant_id=active.tenant_id,
                task_id=active.task_id,
                user_id=user.id,
                time_session_id=active.id,
                hours=hours_decimal,
                description="Generado automaticamente desde control de tiempo",
                created_at=now,
            ),
        )

    session.commit()
    session.refresh(active)
    return active


def get_time_report(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    user_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[dict]:
    stmt = (
        select(
            Task.project_id.label("project_id"),
            Project.name.label("project_name"),
            Task.id.label("task_id"),
            Task.title.label("task_title"),
            User.id.label("user_id"),
            User.email.label("username"),
            func.sum(TimeEntry.hours).label("total_hours"),
            EmployeeProfile.hourly_rate.label("hourly_rate"),
        )
        .select_from(TimeEntry)
        .join(Task, Task.id == TimeEntry.task_id)
        .outerjoin(Project, Project.id == Task.project_id)
        .outerjoin(User, User.id == TimeEntry.user_id)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .group_by(
            Task.project_id,
            Project.name,
            Task.id,
            Task.title,
            User.id,
            User.email,
            EmployeeProfile.hourly_rate,
        )
        .order_by(Project.name, Task.title, User.email)
    )

    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Task.project_id == project_id)
    if tenant_id is not None:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    if user_id is not None:
        stmt = stmt.where(TimeEntry.user_id == user_id)
    if date_from is not None:
        stmt = stmt.where(TimeEntry.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(TimeEntry.created_at <= date_to)

    rows = session.exec(stmt).all()
    return [
        {
            "project_id": row.project_id,
            "project_name": row.project_name,
            "task_id": row.task_id,
            "task_title": row.task_title,
            "user_id": row.user_id,
            "username": row.username,
            "total_hours": row.total_hours,
            "hourly_rate": row.hourly_rate,
        }
        for row in rows
    ]


def list_time_sessions(
    session: Session,
    user: User,
    tenant_id: Optional[int],
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[TimeSession]:
    stmt = select(TimeSession).where(TimeSession.user_id == user.id)
    if tenant_id is not None:
        stmt = stmt.where(TimeSession.tenant_id == tenant_id)
    if date_from is not None:
        stmt = stmt.where(TimeSession.started_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(TimeSession.started_at <= date_to)
    return session.exec(stmt.order_by(TimeSession.started_at.desc())).all()


def create_manual_time_session(
    session: Session,
    user: User,
    task_id: int,
    description: Optional[str],
    started_at: datetime,
    ended_at: datetime,
    tenant_id: Optional[int],
) -> TimeSession:
    # Resuelve el tenant de la misma forma que start_time_session
    task = session.get(Task, task_id)
    if not task:
        raise ValueError("Tarea no encontrada")
    
    resolved_tenant_id = tenant_id or task.tenant_id or user.tenant_id
    if task.tenant_id is not None and resolved_tenant_id is not None and task.tenant_id != resolved_tenant_id:
        raise ValueError("Tarea no encontrada")

    started = _as_aware(started_at)
    ended = _as_aware(ended_at)
    if ended <= started:
        raise ValueError("La fecha de fin debe ser posterior al inicio")

    duration_seconds = max(0, int((ended - started).total_seconds()))
    new_session = TimeSession(
        tenant_id=resolved_tenant_id,
        task_id=task_id,
        user_id=user.id,
        description=description,
        started_at=started,
        ended_at=ended,
        duration_seconds=duration_seconds,
        is_active=False,
        created_at=datetime.now(timezone.utc),
    )
    session.add(new_session)
    session.commit()
    session.refresh(new_session)

    hours_decimal = Decimal(duration_seconds) / Decimal(3600)
    hours_decimal = hours_decimal.quantize(Decimal("0.01"))
    session.add(
        TimeEntry(
            tenant_id=tenant_id,
            task_id=task_id,
            user_id=user.id,
            time_session_id=new_session.id,
            hours=hours_decimal,
            description=description or "Entrada manual de calendario",
            created_at=ended,
        ),
    )
    session.commit()

    return new_session


def update_time_session(
    session: Session,
    user: User,
    session_id: int,
    task_id: Optional[int] = None,
    description: Optional[str] = None,
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    tenant_id: Optional[int] = None,
) -> TimeSession:
    ts = session.get(TimeSession, session_id)
    if not ts or ts.user_id != user.id or (tenant_id is not None and ts.tenant_id != tenant_id):
        raise ValueError("Sesion no encontrada")

    if task_id is not None:
        task = session.get(Task, task_id)
        if not task or (tenant_id is not None and task.tenant_id != tenant_id):
            raise ValueError("Tarea no encontrada")
        ts.task_id = task_id

    if description is not None:
        ts.description = description

    if started_at is not None:
        ts.started_at = _as_aware(started_at)
    if ended_at is not None:
        ts.ended_at = _as_aware(ended_at)

    if ts.ended_at and ts.started_at:
        delta = _as_aware(ts.ended_at) - _as_aware(ts.started_at)
        ts.duration_seconds = max(0, int(delta.total_seconds()))
        ts.is_active = False

    session.add(ts)
    session.commit()
    session.refresh(ts)

    entry = session.exec(
        select(TimeEntry).where(TimeEntry.time_session_id == ts.id),
    ).one_or_none()
    if entry:
        hours_decimal = Decimal(ts.duration_seconds) / Decimal(3600)
        entry.hours = hours_decimal.quantize(Decimal("0.01"))
        entry.task_id = ts.task_id
        entry.user_id = user.id
        entry.created_at = ts.ended_at or ts.started_at
        if description is not None:
            entry.description = description
        session.add(entry)
        session.commit()
        session.refresh(entry)
    elif ts.task_id is not None and ts.ended_at is not None:
        hours_decimal = Decimal(ts.duration_seconds) / Decimal(3600)
        hours_decimal = hours_decimal.quantize(Decimal("0.01"))
        session.add(
            TimeEntry(
                tenant_id=ts.tenant_id,
                task_id=ts.task_id,
                user_id=user.id,
                time_session_id=ts.id,
                hours=hours_decimal,
                description=ts.description or "Generado automaticamente desde control de tiempo",
                created_at=ts.ended_at,
            ),
        )
        session.commit()

    return ts


def delete_time_session(
    session: Session, user: User, session_id: int, tenant_id: Optional[int]
) -> None:
    ts = session.get(TimeSession, session_id)
    if not ts or ts.user_id != user.id or (tenant_id is not None and ts.tenant_id != tenant_id):
        raise ValueError("Sesion no encontrada")

    entries = session.exec(
        select(TimeEntry).where(TimeEntry.time_session_id == ts.id),
    ).all()
    for entry in entries:
        session.delete(entry)
    session.delete(ts)
    session.commit()


def _normalize_work_report_status(value: Optional[str]) -> str:
    normalized = (value or "draft").strip().lower()
    if normalized not in WORK_REPORT_ALLOWED_STATUSES:
        raise ValueError("Estado de parte no valido.")
    return normalized


def _normalize_rental_status(value: Optional[str]) -> str:
    normalized = (value or "active").strip().lower()
    if normalized not in RENTAL_ALLOWED_STATUSES:
        raise ValueError("Estado de maquinaria alquilada no valido.")
    return normalized


def _normalize_rental_price_unit(value: Optional[str]) -> str:
    normalized = (value or "day").strip().lower()
    if normalized not in RENTAL_PRICE_UNITS:
        raise ValueError("Unidad de precio no valida.")
    return normalized


def _is_work_report_closed(report: WorkReport) -> bool:
    return bool(report.is_closed or report.status in WORK_REPORT_CLOSED_STATUSES)


def _validate_work_report_open(report: WorkReport) -> None:
    if _is_work_report_closed(report):
        raise ValueError("El parte esta cerrado y solo permite lectura.")


def _normalize_dt_for_compare(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _get_work_report_or_404(
    session: Session,
    report_id: int,
    tenant_id: int,
    *,
    include_deleted: bool = False,
) -> WorkReport:
    report = session.get(WorkReport, report_id)
    if not report or report.tenant_id != tenant_id:
        raise ValueError("Parte no encontrado.")
    if not include_deleted and report.deleted_at is not None:
        raise ValueError("Parte no encontrado.")
    return report


def _get_work_report_by_external_id(
    session: Session,
    tenant_id: int,
    external_id: str,
    *,
    include_deleted: bool = False,
) -> Optional[WorkReport]:
    stmt = select(WorkReport).where(
        WorkReport.tenant_id == tenant_id,
        WorkReport.external_id == external_id,
    )
    if not include_deleted:
        stmt = stmt.where(WorkReport.deleted_at.is_(None))
    return session.exec(stmt).one_or_none()


def _get_work_report_by_report_identifier(
    session: Session,
    report_identifier: str,
    *,
    include_deleted: bool = False,
) -> Optional[WorkReport]:
    stmt = select(WorkReport).where(WorkReport.report_identifier == report_identifier)
    if not include_deleted:
        stmt = stmt.where(WorkReport.deleted_at.is_(None))
    return session.exec(stmt).one_or_none()


def _raise_work_report_integrity_error(exc: IntegrityError) -> None:
    detail = str(getattr(exc, "orig", exc)).lower()
    if "ix_erp_work_report_report_identifier_uq" in detail or "report_identifier" in detail:
        raise ValueError("Ya existe otro parte con ese identificador.") from exc
    if "ix_erp_work_report_tenant_external" in detail or "external_id" in detail:
        raise ValueError("Ya existe otro parte con ese external_id.") from exc
    if "ix_erp_work_report_tenant_idem" in detail or "idempotency_key" in detail:
        raise ValueError("La operacion ya fue procesada previamente.") from exc
    raise ValueError("No se pudo guardar el parte por un conflicto de datos.") from exc


def list_work_reports(
    session: Session,
    tenant_id: Optional[int],
    *,
    project_id: Optional[int] = None,
    external_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    updated_since: Optional[datetime] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
    current_user: Optional[User] = None,
) -> list[WorkReport]:
    resolved_tenant_id = _require_tenant(tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, resolved_tenant_id)

    stmt = select(WorkReport).where(WorkReport.tenant_id == resolved_tenant_id)
    if not include_deleted:
        stmt = stmt.where(WorkReport.deleted_at.is_(None))
    # Fase 2d: filtro de grupo (Opción B). Solo partes del mismo creator_group_id.
    # Partes legacy con creator_group_id=NULL quedan visibles solo para super_admin.
    if current_user is not None and not current_user.is_super_admin:
        group_id = resolve_creator_group_id(session, current_user, persist=True)
        if group_id is not None:
            stmt = stmt.where(WorkReport.creator_group_id == group_id)
    if project_id is not None:
        stmt = stmt.where(WorkReport.project_id == project_id)
    if external_id is not None:
        stmt = stmt.where(WorkReport.external_id == external_id)
    if date_from is not None:
        stmt = stmt.where(WorkReport.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(WorkReport.date <= date_to)
    if status is not None:
        stmt = stmt.where(WorkReport.status == _normalize_work_report_status(status))
    if updated_since is not None:
        stmt = stmt.where(WorkReport.updated_at >= _normalize_dt_for_compare(updated_since))

    stmt = stmt.order_by(WorkReport.date.desc(), WorkReport.updated_at.desc())
    stmt = stmt.offset(max(0, offset)).limit(max(1, min(limit, 500)))
    return session.exec(stmt).all()


def get_work_report(session: Session, report_id: int, tenant_id: Optional[int]) -> WorkReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    return _get_work_report_or_404(session, report_id, resolved_tenant_id)


def _ensure_work_assignment(
    session: Session,
    *,
    tenant_id: int,
    user_id: Optional[int],
    project_id: int,
    created_by_id: Optional[int] = None,
) -> bool:
    if user_id is None:
        return False

    linked_user = session.get(User, user_id)
    if linked_user is None or linked_user.tenant_id != tenant_id or linked_user.is_super_admin:
        return False

    existing = session.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == user_id,
            UserWorkAssignment.project_id == project_id,
        )
    ).first()
    if existing is not None:
        return False

    session.add(
        UserWorkAssignment(
            tenant_id=tenant_id,
            user_id=user_id,
            project_id=project_id,
            created_by_id=created_by_id or user_id,
        )
    )
    return True


def backfill_user_work_assignments_from_work_reports(
    session: Session,
    *,
    tenant_id: Optional[int] = None,
) -> dict[str, int]:
    stmt = select(WorkReport).where(WorkReport.deleted_at.is_(None)).order_by(
        WorkReport.created_at.asc(),
        WorkReport.id.asc(),
    )
    if tenant_id is not None:
        stmt = stmt.where(WorkReport.tenant_id == tenant_id)

    reports = session.exec(stmt).all()

    created_count = 0
    considered_reports = 0
    for report in reports:
        considered_reports += 1
        candidate_user_ids: list[int] = []
        for candidate in (report.created_by_id, report.updated_by_id):
            if candidate is None:
                continue
            if candidate in candidate_user_ids:
                continue
            candidate_user_ids.append(candidate)

        for candidate_user_id in candidate_user_ids:
            if _ensure_work_assignment(
                session,
                tenant_id=report.tenant_id,
                user_id=candidate_user_id,
                project_id=report.project_id,
                created_by_id=report.created_by_id,
            ):
                created_count += 1

    if created_count > 0:
        session.commit()

    return {
        "reports_scanned": considered_reports,
        "assignments_created": created_count,
    }


def create_work_report(
    session: Session,
    payload: WorkReportCreate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
    idempotency_key: Optional[str] = None,
) -> WorkReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    _get_project_or_404(session, payload.project_id, resolved_tenant_id)

    normalized_idempotency = (idempotency_key or "").strip() or None
    if normalized_idempotency:
        existing_by_key = session.exec(
            select(WorkReport).where(
                WorkReport.tenant_id == resolved_tenant_id,
                WorkReport.idempotency_key == normalized_idempotency,
            )
        ).one_or_none()
        if existing_by_key and existing_by_key.deleted_at is None:
            return existing_by_key

    normalized_external_id = (payload.external_id or "").strip() or None
    if normalized_external_id:
        existing_by_external = _get_work_report_by_external_id(
            session, resolved_tenant_id, normalized_external_id, include_deleted=True
        )
        if existing_by_external and existing_by_external.deleted_at is None:
            return existing_by_external
        if existing_by_external and existing_by_external.deleted_at is not None:
            raise ValueError("Ya existe un parte eliminado con ese external_id.")

    normalized_report_identifier = (payload.report_identifier or "").strip() or None
    if normalized_report_identifier:
        existing_by_identifier = _get_work_report_by_report_identifier(
            session,
            normalized_report_identifier,
            include_deleted=True,
        )
        if existing_by_identifier and existing_by_identifier.deleted_at is None:
            raise ValueError("Ya existe otro parte con ese identificador.")
        if existing_by_identifier and existing_by_identifier.deleted_at is not None:
            raise ValueError("Ya existe un parte eliminado con ese identificador.")

    status = _normalize_work_report_status(payload.status)
    is_closed = bool(payload.is_closed or status in WORK_REPORT_CLOSED_STATUSES)
    if is_closed:
        status = "closed"
    normalized_payload = _normalize_work_report_person_links_v2(
        session,
        payload.payload,
        resolved_tenant_id,
    )

    # Fase 2a: resolver creator_group_id del usuario que crea el parte.
    # No activa ningún filtro de visibilidad; solo persiste el campo para Fase 2c.
    creator_group_id: Optional[int] = None
    if current_user_id is not None:
        creator_user = session.get(User, current_user_id)
        if creator_user is not None and not creator_user.is_super_admin:
            creator_group_id = resolve_creator_group_id(session, creator_user, persist=True)

    now = datetime.now(UTC).replace(tzinfo=None)
    report = WorkReport(
        tenant_id=resolved_tenant_id,
        project_id=payload.project_id,
        external_id=normalized_external_id,
        report_identifier=normalized_report_identifier,
        idempotency_key=normalized_idempotency,
        title=(payload.title or "").strip() or None,
        date=payload.date,
        status=status,
        is_closed=is_closed,
        payload=normalized_payload,
        created_by_id=current_user_id,
        updated_by_id=current_user_id,
        creator_group_id=creator_group_id,
        created_at=now,
        updated_at=now,
    )
    session.add(report)
    _ensure_work_assignment(
        session,
        tenant_id=resolved_tenant_id,
        user_id=current_user_id,
        project_id=payload.project_id,
        created_by_id=current_user_id,
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        _raise_work_report_integrity_error(exc)
    session.refresh(report)
    return report


def update_work_report(
    session: Session,
    report_id: int,
    payload: WorkReportUpdate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    report = _get_work_report_or_404(session, report_id, resolved_tenant_id)
    _validate_work_report_open(report)

    if payload.expected_updated_at is not None:
        expected = _normalize_dt_for_compare(payload.expected_updated_at)
        current = _normalize_dt_for_compare(report.updated_at)
        if current != expected:
            raise ValueError("Conflicto de concurrencia: el parte fue actualizado por otro proceso.")

    if payload.project_id is not None:
        _get_project_or_404(session, payload.project_id, resolved_tenant_id)
        report.project_id = payload.project_id

    if payload.external_id is not None:
        normalized_external_id = payload.external_id.strip() or None
        if normalized_external_id:
            existing = _get_work_report_by_external_id(
                session,
                resolved_tenant_id,
                normalized_external_id,
                include_deleted=True,
            )
            if existing and existing.id != report.id:
                raise ValueError("Ya existe otro parte con ese external_id.")
        report.external_id = normalized_external_id

    if payload.report_identifier is not None:
        normalized_report_identifier = payload.report_identifier.strip() or None
        if normalized_report_identifier:
            existing_identifier = _get_work_report_by_report_identifier(
                session,
                normalized_report_identifier,
                include_deleted=True,
            )
            if existing_identifier and existing_identifier.id != report.id:
                raise ValueError("Ya existe otro parte con ese identificador.")
        report.report_identifier = normalized_report_identifier
    if payload.title is not None:
        report.title = payload.title.strip() or None
    if payload.date is not None:
        report.date = payload.date
    if payload.status is not None:
        next_status = _normalize_work_report_status(payload.status)
        report.status = next_status
        if next_status in WORK_REPORT_CLOSED_STATUSES:
            report.is_closed = True
    if payload.is_closed is True:
        report.is_closed = True
        report.status = "closed"
    if payload.is_closed is False and report.is_closed:
        raise ValueError("No se permite reabrir un parte cerrado.")
    if payload.payload is not None:
        report.payload = _normalize_work_report_person_links_v2(
            session,
            payload.payload,
            resolved_tenant_id,
        )

    report.updated_by_id = current_user_id
    report.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(report)
    _ensure_work_assignment(
        session,
        tenant_id=resolved_tenant_id,
        user_id=current_user_id,
        project_id=report.project_id,
        created_by_id=report.created_by_id or current_user_id,
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        _raise_work_report_integrity_error(exc)
    session.refresh(report)
    return report


def delete_work_report(
    session: Session,
    report_id: int,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    report = _get_work_report_or_404(session, report_id, resolved_tenant_id)
    _validate_work_report_open(report)

    now = datetime.now(UTC).replace(tzinfo=None)
    report.deleted_at = now
    report.updated_at = now
    report.updated_by_id = current_user_id
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def hard_delete_work_report(
    session: Session,
    report_id: int,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> None:
    resolved_tenant_id = _require_tenant(tenant_id)
    report = _get_work_report_or_404(session, report_id, resolved_tenant_id, include_deleted=True)
    _validate_work_report_open(report)
    if report.id is None:
        raise ValueError("Parte no encontrado.")

    session.execute(
        delete(WorkReportSyncLog).where(WorkReportSyncLog.server_report_id == report.id)
    )
    session.execute(
        delete(WorkInventorySyncLog).where(WorkInventorySyncLog.work_report_id == report.id)
    )
    session.delete(report)
    session.commit()


def _coerce_date(value: Any, *, field_name: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{field_name} debe tener formato YYYY-MM-DD.") from exc
    raise ValueError(f"{field_name} es obligatorio.")


def _coerce_datetime(value: Any, *, field_name: str) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        candidate = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(candidate)
        except ValueError as exc:
            raise ValueError(f"{field_name} debe tener formato ISO 8601.") from exc
    raise ValueError(f"{field_name} debe tener formato ISO 8601.")


def _coerce_int(value: Any, *, field_name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} no valido.")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    raise ValueError(f"{field_name} no valido.")


def _as_sync_payload_dict(raw_payload: Any) -> dict[str, Any]:
    if raw_payload is None:
        return {}
    if isinstance(raw_payload, dict):
        return raw_payload
    return {"value": raw_payload}


def _pick_value(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def _resolve_work_report_for_sync(
    session: Session,
    tenant_id: int,
    *,
    report_id: Optional[int],
    external_id: Optional[str],
    data: dict[str, Any],
) -> WorkReport:
    if report_id is not None:
        return _get_work_report_or_404(session, report_id, tenant_id, include_deleted=True)

    normalized_external_id = (external_id or "").strip()
    if normalized_external_id:
        report = _get_work_report_by_external_id(
            session,
            tenant_id,
            normalized_external_id,
            include_deleted=True,
        )
        if report:
            return report

    data_report_id = _pick_value(data, "report_id", "reportId", "id")
    if data_report_id is not None:
        if isinstance(data_report_id, int) or (
            isinstance(data_report_id, str) and data_report_id.strip().isdigit()
        ):
            return _get_work_report_or_404(
                session,
                _coerce_int(data_report_id, field_name="report_id"),
                tenant_id,
                include_deleted=True,
            )

        report = _get_work_report_by_external_id(
            session,
            tenant_id,
            str(data_report_id).strip(),
            include_deleted=True,
        )
        if report:
            return report

    raise ValueError("Parte no encontrado.")


def sync_work_reports(
    session: Session,
    tenant_id: Optional[int],
    payload: WorkReportSyncRequest,
    *,
    current_user_id: Optional[int],
    current_user: Optional[User] = None,
) -> WorkReportSyncResponse:
    resolved_tenant_id = _require_tenant(tenant_id)
    acknowledgements: list[WorkReportSyncAck] = []
    id_map: dict[str, int] = {}

    for operation in payload.operations:
        existing_log = session.exec(
            select(WorkReportSyncLog).where(
                WorkReportSyncLog.tenant_id == resolved_tenant_id,
                WorkReportSyncLog.client_op_id == operation.client_op_id,
            )
        ).one_or_none()

        if existing_log:
            cached_payload = existing_log.response_payload or {}
            try:
                ack = WorkReportSyncAck(**cached_payload)
            except Exception:
                ack = WorkReportSyncAck(
                    client_op_id=operation.client_op_id,
                    op=operation.op,
                    ok=existing_log.status == "ok",
                    report_id=existing_log.server_report_id,
                    external_id=existing_log.external_id,
                    error=existing_log.error,
                )
            acknowledgements.append(ack)
            if ack.client_temp_id and ack.mapped_server_id is not None:
                id_map[ack.client_temp_id] = ack.mapped_server_id
            continue

        op_data = _as_sync_payload_dict(operation.data)
        report: Optional[WorkReport] = None
        error: Optional[str] = None
        client_temp_id = operation.client_temp_id or _pick_value(
            op_data, "client_temp_id", "clientTempId", "id"
        )
        if client_temp_id is not None:
            client_temp_id = str(client_temp_id)

        try:
            if operation.op == "create":
                project_id = _coerce_int(
                    _pick_value(op_data, "project_id", "projectId"),
                    field_name="project_id",
                )
                report_date = _coerce_date(
                    _pick_value(op_data, "date"),
                    field_name="date",
                )
                report = create_work_report(
                    session,
                    WorkReportCreate(
                        project_id=project_id,
                        date=report_date,
                        title=_pick_value(op_data, "title"),
                        status=_pick_value(op_data, "status") or "draft",
                        is_closed=bool(_pick_value(op_data, "is_closed", "isClosed") or False),
                        report_identifier=_pick_value(
                            op_data, "report_identifier", "reportIdentifier"
                        ),
                        external_id=operation.external_id
                        or _pick_value(op_data, "external_id", "externalId", "id"),
                        payload=_as_sync_payload_dict(_pick_value(op_data, "payload")),
                    ),
                    resolved_tenant_id,
                    current_user_id=current_user_id,
                    idempotency_key=operation.client_op_id,
                )

            elif operation.op == "update":
                report = _resolve_work_report_for_sync(
                    session,
                    resolved_tenant_id,
                    report_id=operation.report_id,
                    external_id=operation.external_id,
                    data=op_data,
                )
                patch_data = _as_sync_payload_dict(_pick_value(op_data, "patch")) or op_data
                update_kwargs: dict[str, Any] = {}
                if _pick_value(patch_data, "project_id", "projectId") is not None:
                    update_kwargs["project_id"] = _coerce_int(
                        _pick_value(patch_data, "project_id", "projectId"),
                        field_name="project_id",
                    )
                if _pick_value(patch_data, "title") is not None:
                    update_kwargs["title"] = str(_pick_value(patch_data, "title"))
                if _pick_value(patch_data, "status") is not None:
                    update_kwargs["status"] = str(_pick_value(patch_data, "status"))
                if _pick_value(patch_data, "is_closed", "isClosed") is not None:
                    update_kwargs["is_closed"] = bool(
                        _pick_value(patch_data, "is_closed", "isClosed")
                    )
                if _pick_value(patch_data, "report_identifier", "reportIdentifier") is not None:
                    update_kwargs["report_identifier"] = str(
                        _pick_value(patch_data, "report_identifier", "reportIdentifier")
                    )
                if _pick_value(patch_data, "external_id", "externalId") is not None:
                    update_kwargs["external_id"] = str(
                        _pick_value(patch_data, "external_id", "externalId")
                    )
                if "payload" in patch_data:
                    update_kwargs["payload"] = _as_sync_payload_dict(patch_data.get("payload"))
                if _pick_value(
                    patch_data, "expected_updated_at", "expectedUpdatedAt"
                ) is not None:
                    update_kwargs["expected_updated_at"] = _coerce_datetime(
                        _pick_value(
                            patch_data,
                            "expected_updated_at",
                            "expectedUpdatedAt",
                        ),
                        field_name="expected_updated_at",
                    )

                # Sync updates never modify the report date.
                # This also protects against legacy clients sending `date`.
                update_kwargs.pop("date", None)

                report = update_work_report(
                    session,
                    report.id,
                    WorkReportUpdate(**update_kwargs),
                    resolved_tenant_id,
                    current_user_id=current_user_id,
                )

            elif operation.op == "delete":
                report = _resolve_work_report_for_sync(
                    session,
                    resolved_tenant_id,
                    report_id=operation.report_id,
                    external_id=operation.external_id,
                    data=op_data,
                )
                report = delete_work_report(
                    session,
                    report.id,
                    resolved_tenant_id,
                    current_user_id=current_user_id,
                )
            else:
                raise ValueError("Operacion de sync no soportada.")

        except ValueError as exc:
            error = str(exc)

        ack = WorkReportSyncAck(
            client_op_id=operation.client_op_id,
            op=operation.op,
            ok=error is None,
            report_id=report.id if report else None,
            external_id=report.external_id if report else operation.external_id,
            client_temp_id=client_temp_id,
            mapped_server_id=report.id if report and client_temp_id else None,
            server_updated_at=report.updated_at if report else None,
            error=error,
        )
        acknowledgements.append(ack)
        if ack.client_temp_id and ack.mapped_server_id is not None:
            id_map[ack.client_temp_id] = ack.mapped_server_id

        session.add(
            WorkReportSyncLog(
                tenant_id=resolved_tenant_id,
                client_op_id=operation.client_op_id,
                op=operation.op,
                status="ok" if ack.ok else "error",
                server_report_id=ack.report_id,
                external_id=ack.external_id,
                error=ack.error,
                response_payload=ack.model_dump(mode="json"),
                processed_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        session.commit()

    server_changes: list[WorkReport] = []
    if payload.since is not None:
        server_changes = list_work_reports(
            session,
            resolved_tenant_id,
            updated_since=payload.since,
            include_deleted=True,
            limit=payload.limit,
            offset=0,
            current_user=current_user,
        )

    return WorkReportSyncResponse(
        ack=acknowledgements,
        id_map=id_map,
        server_changes=server_changes,
    )


def _get_access_control_or_404(
    session: Session,
    report_id: int,
    tenant_id: int,
    *,
    include_deleted: bool = False,
) -> AccessControlReport:
    report = session.get(AccessControlReport, report_id)
    if not report or report.tenant_id != tenant_id:
        raise ValueError("Control de accesos no encontrado.")
    if not include_deleted and report.deleted_at is not None:
        raise ValueError("Control de accesos no encontrado.")
    return report


def _get_access_control_by_external_id(
    session: Session,
    tenant_id: int,
    external_id: str,
    *,
    include_deleted: bool = False,
) -> Optional[AccessControlReport]:
    stmt = select(AccessControlReport).where(
        AccessControlReport.tenant_id == tenant_id,
        AccessControlReport.external_id == external_id,
    )
    if not include_deleted:
        stmt = stmt.where(AccessControlReport.deleted_at.is_(None))
    return session.exec(stmt).one_or_none()


def list_access_control_reports(
    session: Session,
    tenant_id: Optional[int],
    *,
    project_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    updated_since: Optional[datetime] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[AccessControlReport]:
    resolved_tenant_id = _require_tenant(tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, resolved_tenant_id)

    stmt = select(AccessControlReport).where(AccessControlReport.tenant_id == resolved_tenant_id)
    if not include_deleted:
        stmt = stmt.where(AccessControlReport.deleted_at.is_(None))
    if project_id is not None:
        stmt = stmt.where(AccessControlReport.project_id == project_id)
    if date_from is not None:
        stmt = stmt.where(AccessControlReport.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(AccessControlReport.date <= date_to)
    if updated_since is not None:
        stmt = stmt.where(AccessControlReport.updated_at >= _normalize_dt_for_compare(updated_since))

    stmt = stmt.order_by(AccessControlReport.date.desc(), AccessControlReport.updated_at.desc())
    stmt = stmt.offset(max(0, offset)).limit(max(1, min(limit, 500)))
    return session.exec(stmt).all()


def get_access_control_report(
    session: Session,
    report_id: int,
    tenant_id: Optional[int],
) -> AccessControlReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    return _get_access_control_or_404(session, report_id, resolved_tenant_id)


def create_access_control_report(
    session: Session,
    payload: AccessControlReportCreate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> AccessControlReport:
    resolved_tenant_id = _require_tenant(tenant_id)

    if payload.project_id is not None:
        _get_project_or_404(session, payload.project_id, resolved_tenant_id)

    normalized_external_id = (payload.external_id or "").strip() or None
    if normalized_external_id:
        existing_by_external = _get_access_control_by_external_id(
            session, resolved_tenant_id, normalized_external_id, include_deleted=True
        )
        if existing_by_external and existing_by_external.deleted_at is None:
            return existing_by_external
        if existing_by_external and existing_by_external.deleted_at is not None:
            raise ValueError("Ya existe un control de accesos eliminado con ese external_id.")

    now = datetime.now(UTC).replace(tzinfo=None)
    report = AccessControlReport(
        tenant_id=resolved_tenant_id,
        project_id=payload.project_id,
        external_id=normalized_external_id,
        date=payload.date,
        site_name=(payload.site_name or "").strip(),
        responsible=(payload.responsible or "").strip(),
        responsible_entry_time=(payload.responsible_entry_time or "").strip() or None,
        responsible_exit_time=(payload.responsible_exit_time or "").strip() or None,
        observations=payload.observations or "",
        personal_entries=list(payload.personal_entries or []),
        machinery_entries=list(payload.machinery_entries or []),
        additional_tasks=(payload.additional_tasks or "").strip() or None,
        created_by_id=current_user_id,
        updated_by_id=current_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def update_access_control_report(
    session: Session,
    report_id: int,
    payload: AccessControlReportUpdate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> AccessControlReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    report = _get_access_control_or_404(session, report_id, resolved_tenant_id)

    if payload.expected_updated_at is not None:
        expected = _normalize_dt_for_compare(payload.expected_updated_at)
        current = _normalize_dt_for_compare(report.updated_at)
        if current != expected:
            raise ValueError("Conflicto de concurrencia: el control de accesos fue actualizado por otro proceso.")

    if payload.project_id is not None:
        _get_project_or_404(session, payload.project_id, resolved_tenant_id)
        report.project_id = payload.project_id

    if payload.external_id is not None:
        normalized_external_id = payload.external_id.strip() or None
        if normalized_external_id:
            existing = _get_access_control_by_external_id(
                session,
                resolved_tenant_id,
                normalized_external_id,
                include_deleted=True,
            )
            if existing and existing.id != report.id:
                raise ValueError("Ya existe otro control de accesos con ese external_id.")
        report.external_id = normalized_external_id

    if payload.date is not None:
        report.date = payload.date
    if payload.site_name is not None:
        report.site_name = payload.site_name.strip()
    if payload.responsible is not None:
        report.responsible = payload.responsible.strip()
    if payload.responsible_entry_time is not None:
        report.responsible_entry_time = payload.responsible_entry_time.strip() or None
    if payload.responsible_exit_time is not None:
        report.responsible_exit_time = payload.responsible_exit_time.strip() or None
    if payload.observations is not None:
        report.observations = payload.observations
    if payload.personal_entries is not None:
        report.personal_entries = list(payload.personal_entries)
    if payload.machinery_entries is not None:
        report.machinery_entries = list(payload.machinery_entries)
    if payload.additional_tasks is not None:
        report.additional_tasks = payload.additional_tasks.strip() or None

    report.updated_by_id = current_user_id
    report.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def delete_access_control_report(
    session: Session,
    report_id: int,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> AccessControlReport:
    resolved_tenant_id = _require_tenant(tenant_id)
    report = _get_access_control_or_404(session, report_id, resolved_tenant_id)

    now = datetime.now(UTC).replace(tzinfo=None)
    report.deleted_at = now
    report.updated_at = now
    report.updated_by_id = current_user_id
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def _validate_rental_date_range(start_date: date, end_date: Optional[date]) -> None:
    if end_date is not None and end_date < start_date:
        raise ValueError("La fecha de fin debe ser posterior o igual a la fecha de inicio.")


def _get_rental_machinery_or_404(
    session: Session,
    machinery_id: int,
    tenant_id: int,
    *,
    include_deleted: bool = False,
) -> RentalMachinery:
    machinery = session.get(RentalMachinery, machinery_id)
    if not machinery or machinery.tenant_id != tenant_id:
        raise ValueError("Maquinaria alquilada no encontrada.")
    if not include_deleted and machinery.deleted_at is not None:
        raise ValueError("Maquinaria alquilada no encontrada.")
    return machinery


def list_rental_machinery(
    session: Session,
    tenant_id: Optional[int],
    *,
    project_id: Optional[int] = None,
    active_on: Optional[date] = None,
    status: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[RentalMachinery]:
    resolved_tenant_id = _require_tenant(tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, resolved_tenant_id)

    stmt = select(RentalMachinery).where(
        RentalMachinery.tenant_id == resolved_tenant_id,
        RentalMachinery.is_rental.is_(True),
    )
    if not include_deleted:
        stmt = stmt.where(RentalMachinery.deleted_at.is_(None))
    if project_id is not None:
        stmt = stmt.where(RentalMachinery.project_id == project_id)
    if status is not None:
        stmt = stmt.where(RentalMachinery.status == _normalize_rental_status(status))
    if active_on is not None:
        stmt = stmt.where(RentalMachinery.start_date <= active_on)
        stmt = stmt.where(
            (RentalMachinery.end_date.is_(None)) | (RentalMachinery.end_date >= active_on)
        )
        if status is None:
            stmt = stmt.where(RentalMachinery.status == "active")

    stmt = stmt.order_by(RentalMachinery.start_date.desc(), RentalMachinery.updated_at.desc())
    stmt = stmt.offset(max(0, offset)).limit(max(1, min(limit, 500)))
    return session.exec(stmt).all()


def create_rental_machinery(
    session: Session,
    payload: RentalMachineryCreate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> RentalMachinery:
    resolved_tenant_id = _require_tenant(tenant_id)
    _get_project_or_404(session, payload.project_id, resolved_tenant_id)
    _validate_rental_date_range(payload.start_date, payload.end_date)
    cleaned_name = payload.name.strip()
    if not cleaned_name:
        raise ValueError("El nombre de la maquinaria es obligatorio.")

    now = datetime.now(UTC).replace(tzinfo=None)
    machinery = RentalMachinery(
        tenant_id=resolved_tenant_id,
        project_id=payload.project_id,
        is_rental=bool(payload.is_rental),
        name=cleaned_name,
        machine_number=(payload.machine_number or "").strip() or None,
        description=(payload.description or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        image_url=(payload.image_url or "").strip() or None,
        provider=(payload.provider or "").strip() or None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        price=payload.price,
        price_unit=_normalize_rental_price_unit(payload.price_unit),
        status=_normalize_rental_status(payload.status),
        created_by_id=current_user_id,
        updated_by_id=current_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(machinery)
    session.commit()
    session.refresh(machinery)
    return machinery


def update_rental_machinery(
    session: Session,
    machinery_id: int,
    payload: RentalMachineryUpdate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> RentalMachinery:
    resolved_tenant_id = _require_tenant(tenant_id)
    machinery = _get_rental_machinery_or_404(session, machinery_id, resolved_tenant_id)

    if payload.project_id is not None:
        _get_project_or_404(session, payload.project_id, resolved_tenant_id)
        machinery.project_id = payload.project_id
    if payload.is_rental is not None:
        machinery.is_rental = bool(payload.is_rental)
    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise ValueError("El nombre de la maquinaria es obligatorio.")
        machinery.name = cleaned_name
    if payload.machine_number is not None:
        machinery.machine_number = payload.machine_number.strip() or None
    if payload.description is not None:
        machinery.description = payload.description.strip() or None
    if payload.notes is not None:
        machinery.notes = payload.notes.strip() or None
    if payload.image_url is not None:
        machinery.image_url = payload.image_url.strip() or None
    if payload.provider is not None:
        machinery.provider = payload.provider.strip() or None

    next_start_date = payload.start_date if payload.start_date is not None else machinery.start_date
    next_end_date = payload.end_date if payload.end_date is not None else machinery.end_date
    _validate_rental_date_range(next_start_date, next_end_date)
    machinery.start_date = next_start_date
    machinery.end_date = next_end_date

    if payload.price is not None:
        machinery.price = payload.price
    if payload.price_unit is not None:
        machinery.price_unit = _normalize_rental_price_unit(payload.price_unit)
    if payload.status is not None:
        machinery.status = _normalize_rental_status(payload.status)

    machinery.updated_by_id = current_user_id
    machinery.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(machinery)
    session.commit()
    session.refresh(machinery)
    return machinery


def delete_rental_machinery(
    session: Session,
    machinery_id: int,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> RentalMachinery:
    resolved_tenant_id = _require_tenant(tenant_id)
    machinery = _get_rental_machinery_or_404(session, machinery_id, resolved_tenant_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    machinery.deleted_at = now
    machinery.updated_at = now
    machinery.updated_by_id = current_user_id
    session.add(machinery)
    session.commit()
    session.refresh(machinery)
    return machinery


def _normalize_work_service_status(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized not in WORK_SERVICE_ALLOWED_STATUSES:
        raise ValueError(f"Estado invalido: {value}")
    return normalized


def _build_work_service_code(
    session: Session,
    model: type[WorkRepaso] | type[WorkPostventa],
    tenant_id: int,
    prefix: str,
) -> str:
    count = session.exec(
        select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
    ).one()
    return f"{prefix}-{int(count or 0) + 1:05d}"


def _sanitize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _sanitize_required_text(value: str, field_name: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError(f"{field_name} es obligatorio.")
    return cleaned


def _to_positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
        return parsed if parsed > 0 else None
    return None


def _normalize_work_report_person_links(
    session: Session,
    payload_data: dict[str, Any] | None,
    tenant_id: int,
) -> dict[str, Any]:
    normalized_payload = dict(payload_data or {})

    raw_main_foreman_user_id = normalized_payload.get(
        "mainForemanUserId",
        normalized_payload.get("main_foreman_user_id"),
    )
    if raw_main_foreman_user_id is None or raw_main_foreman_user_id == "":
        normalized_payload.pop("mainForemanUserId", None)
        normalized_payload.pop("main_foreman_user_id", None)
        return normalized_payload

    main_foreman_user_id = _to_positive_int(raw_main_foreman_user_id)
    if main_foreman_user_id is None:
        raise ValueError("El usuario seleccionado para el encargado principal no es válido.")

    linked_user = session.get(User, main_foreman_user_id)
    if not linked_user or linked_user.tenant_id != tenant_id:
        raise ValueError("El usuario seleccionado para el encargado principal no pertenece al tenant.")
    if linked_user.is_super_admin:
        raise ValueError("No se permite vincular al super_admin como encargado principal.")

    normalized_payload["mainForemanUserId"] = int(main_foreman_user_id)
    normalized_payload.pop("main_foreman_user_id", None)
    return normalized_payload


def _normalize_work_report_person_links_v2(
    session: Session,
    payload_data: dict[str, Any] | None,
    tenant_id: int,
) -> dict[str, Any]:
    normalized_payload = dict(payload_data or {})

    person_link_specs = [
        ("mainForemanUserId", "main_foreman_user_id", "encargado principal"),
        ("siteManagerUserId", "site_manager_user_id", "jefe de obra"),
    ]

    for canonical_key, legacy_key, label in person_link_specs:
        raw_user_id = normalized_payload.get(canonical_key, normalized_payload.get(legacy_key))
        if raw_user_id is None or raw_user_id == "":
            normalized_payload.pop(canonical_key, None)
            normalized_payload.pop(legacy_key, None)
            continue

        resolved_user_id = _to_positive_int(raw_user_id)
        if resolved_user_id is None:
            raise ValueError(f"El usuario seleccionado para el {label} no es válido.")

        linked_user = session.get(User, resolved_user_id)
        if not linked_user or linked_user.tenant_id != tenant_id:
            raise ValueError(f"El usuario seleccionado para el {label} no pertenece al tenant.")
        if linked_user.is_super_admin:
            raise ValueError(f"No se permite vincular al super_admin como {label}.")

        normalized_payload[canonical_key] = int(resolved_user_id)
        normalized_payload.pop(legacy_key, None)

    return normalized_payload


def _get_repaso_or_404(
    session: Session,
    repaso_id: int,
    tenant_id: int,
    *,
    include_deleted: bool = False,
) -> WorkRepaso:
    repaso = session.get(WorkRepaso, repaso_id)
    if not repaso or repaso.tenant_id != tenant_id:
        raise ValueError("Repaso no encontrado.")
    if not include_deleted and repaso.deleted_at is not None:
        raise ValueError("Repaso no encontrado.")
    return repaso


def _get_postventa_or_404(
    session: Session,
    postventa_id: int,
    tenant_id: int,
    *,
    include_deleted: bool = False,
) -> WorkPostventa:
    postventa = session.get(WorkPostventa, postventa_id)
    if not postventa or postventa.tenant_id != tenant_id:
        raise ValueError("Post-venta no encontrada.")
    if not include_deleted and postventa.deleted_at is not None:
        raise ValueError("Post-venta no encontrada.")
    return postventa


def list_work_repasos(
    session: Session,
    tenant_id: Optional[int],
    *,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[WorkRepaso]:
    resolved_tenant_id = _require_tenant(tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, resolved_tenant_id)

    stmt = select(WorkRepaso).where(WorkRepaso.tenant_id == resolved_tenant_id)
    if not include_deleted:
        stmt = stmt.where(WorkRepaso.deleted_at.is_(None))
    if project_id is not None:
        stmt = stmt.where(WorkRepaso.project_id == project_id)
    if status is not None:
        stmt = stmt.where(WorkRepaso.status == _normalize_work_service_status(status))

    stmt = stmt.order_by(WorkRepaso.updated_at.desc())
    stmt = stmt.offset(max(0, offset)).limit(max(1, min(limit, 500)))
    return session.exec(stmt).all()


def create_work_repaso(
    session: Session,
    payload: WorkRepasoCreate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkRepaso:
    resolved_tenant_id = _require_tenant(tenant_id)
    _get_project_or_404(session, payload.project_id, resolved_tenant_id)

    external_id = _sanitize_optional_text(payload.external_id)
    if external_id:
        existing = session.exec(
            select(WorkRepaso).where(
                WorkRepaso.tenant_id == resolved_tenant_id,
                WorkRepaso.external_id == external_id,
            )
        ).first()
        if existing:
            return existing

    now = datetime.now(UTC).replace(tzinfo=None)
    repaso = WorkRepaso(
        tenant_id=resolved_tenant_id,
        project_id=payload.project_id,
        external_id=external_id,
        code=_build_work_service_code(session, WorkRepaso, resolved_tenant_id, "REP"),
        status=_normalize_work_service_status(payload.status),
        description=_sanitize_required_text(payload.description, "La descripcion"),
        assigned_company=_sanitize_optional_text(payload.assigned_company),
        estimated_hours=payload.estimated_hours,
        actual_hours=payload.actual_hours,
        before_image=_sanitize_optional_text(payload.before_image),
        after_image=_sanitize_optional_text(payload.after_image),
        subcontract_groups=payload.subcontract_groups or [],
        created_by_id=current_user_id,
        updated_by_id=current_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(repaso)
    session.commit()
    session.refresh(repaso)
    return repaso


def update_work_repaso(
    session: Session,
    repaso_id: int,
    payload: WorkRepasoUpdate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkRepaso:
    resolved_tenant_id = _require_tenant(tenant_id)
    repaso = _get_repaso_or_404(session, repaso_id, resolved_tenant_id)

    if payload.project_id is not None:
        _get_project_or_404(session, payload.project_id, resolved_tenant_id)
        repaso.project_id = payload.project_id
    if payload.status is not None:
        repaso.status = _normalize_work_service_status(payload.status)
    if payload.description is not None:
        repaso.description = _sanitize_required_text(payload.description, "La descripcion")
    if payload.assigned_company is not None:
        repaso.assigned_company = _sanitize_optional_text(payload.assigned_company)
    if payload.estimated_hours is not None:
        repaso.estimated_hours = payload.estimated_hours
    if payload.actual_hours is not None:
        repaso.actual_hours = payload.actual_hours
    if payload.before_image is not None:
        repaso.before_image = _sanitize_optional_text(payload.before_image)
    if payload.after_image is not None:
        repaso.after_image = _sanitize_optional_text(payload.after_image)
    if payload.subcontract_groups is not None:
        repaso.subcontract_groups = payload.subcontract_groups

    repaso.updated_by_id = current_user_id
    repaso.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(repaso)
    session.commit()
    session.refresh(repaso)
    return repaso


def delete_work_repaso(
    session: Session,
    repaso_id: int,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkRepaso:
    resolved_tenant_id = _require_tenant(tenant_id)
    repaso = _get_repaso_or_404(session, repaso_id, resolved_tenant_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    repaso.deleted_at = now
    repaso.updated_at = now
    repaso.updated_by_id = current_user_id
    session.add(repaso)
    session.commit()
    session.refresh(repaso)
    return repaso


def list_work_postventas(
    session: Session,
    tenant_id: Optional[int],
    *,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[WorkPostventa]:
    resolved_tenant_id = _require_tenant(tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, resolved_tenant_id)

    stmt = select(WorkPostventa).where(WorkPostventa.tenant_id == resolved_tenant_id)
    if not include_deleted:
        stmt = stmt.where(WorkPostventa.deleted_at.is_(None))
    if project_id is not None:
        stmt = stmt.where(WorkPostventa.project_id == project_id)
    if status is not None:
        stmt = stmt.where(WorkPostventa.status == _normalize_work_service_status(status))

    stmt = stmt.order_by(WorkPostventa.updated_at.desc())
    stmt = stmt.offset(max(0, offset)).limit(max(1, min(limit, 500)))
    return session.exec(stmt).all()


def create_work_postventa(
    session: Session,
    payload: WorkPostventaCreate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkPostventa:
    resolved_tenant_id = _require_tenant(tenant_id)
    _get_project_or_404(session, payload.project_id, resolved_tenant_id)

    external_id = _sanitize_optional_text(payload.external_id)
    if external_id:
        existing = session.exec(
            select(WorkPostventa).where(
                WorkPostventa.tenant_id == resolved_tenant_id,
                WorkPostventa.external_id == external_id,
            )
        ).first()
        if existing:
            return existing

    now = datetime.now(UTC).replace(tzinfo=None)
    postventa = WorkPostventa(
        tenant_id=resolved_tenant_id,
        project_id=payload.project_id,
        external_id=external_id,
        code=_build_work_service_code(session, WorkPostventa, resolved_tenant_id, "POS"),
        status=_normalize_work_service_status(payload.status),
        description=_sanitize_required_text(payload.description, "La descripcion"),
        assigned_company=_sanitize_optional_text(payload.assigned_company),
        estimated_hours=payload.estimated_hours,
        actual_hours=payload.actual_hours,
        before_image=_sanitize_optional_text(payload.before_image),
        after_image=_sanitize_optional_text(payload.after_image),
        subcontract_groups=payload.subcontract_groups or [],
        created_by_id=current_user_id,
        updated_by_id=current_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(postventa)
    session.commit()
    session.refresh(postventa)
    return postventa


def update_work_postventa(
    session: Session,
    postventa_id: int,
    payload: WorkPostventaUpdate,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkPostventa:
    resolved_tenant_id = _require_tenant(tenant_id)
    postventa = _get_postventa_or_404(session, postventa_id, resolved_tenant_id)

    if payload.project_id is not None:
        _get_project_or_404(session, payload.project_id, resolved_tenant_id)
        postventa.project_id = payload.project_id
    if payload.status is not None:
        postventa.status = _normalize_work_service_status(payload.status)
    if payload.description is not None:
        postventa.description = _sanitize_required_text(payload.description, "La descripcion")
    if payload.assigned_company is not None:
        postventa.assigned_company = _sanitize_optional_text(payload.assigned_company)
    if payload.estimated_hours is not None:
        postventa.estimated_hours = payload.estimated_hours
    if payload.actual_hours is not None:
        postventa.actual_hours = payload.actual_hours
    if payload.before_image is not None:
        postventa.before_image = _sanitize_optional_text(payload.before_image)
    if payload.after_image is not None:
        postventa.after_image = _sanitize_optional_text(payload.after_image)
    if payload.subcontract_groups is not None:
        postventa.subcontract_groups = payload.subcontract_groups

    postventa.updated_by_id = current_user_id
    postventa.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(postventa)
    session.commit()
    session.refresh(postventa)
    return postventa


def delete_work_postventa(
    session: Session,
    postventa_id: int,
    tenant_id: Optional[int],
    *,
    current_user_id: Optional[int],
) -> WorkPostventa:
    resolved_tenant_id = _require_tenant(tenant_id)
    postventa = _get_postventa_or_404(session, postventa_id, resolved_tenant_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    postventa.deleted_at = now
    postventa.updated_at = now
    postventa.updated_by_id = current_user_id
    session.add(postventa)
    session.commit()
    session.refresh(postventa)
    return postventa




