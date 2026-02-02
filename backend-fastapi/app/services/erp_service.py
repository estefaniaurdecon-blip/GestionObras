from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import func

from app.models.erp import (
    Activity,
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
)
from app.models.hr import EmployeeProfile
from app.models.notification import NotificationType
from app.models.user import User
from app.schemas.erp import (
    ActivityCreate,
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
    BudgetLineMilestoneRead,
    ProjectBudgetMilestoneCreate,
    ProjectBudgetMilestoneRead,
    ProjectBudgetMilestoneUpdate,
    ProjectBudgetLineCreate,
    ProjectBudgetLineUpdate,
)
from app.services.notification_service import create_notification

TASK_STATUSES = {"pending", "in_progress", "done"}

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
    # Si vienen hitos dinÃ¡micos, recalculamos totales.
    milestones_payload: list[BudgetLineMilestoneCreate] = data.milestones or []
    if milestones_payload:
        total_amount = sum(Decimal(m.amount) for m in milestones_payload)
        total_justified = sum(Decimal(m.justified) for m in milestones_payload)
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

    _validate_budget_totals(
        hito1_budget=data.hito1_budget,
        hito2_budget=data.hito2_budget,
        approved_budget=data.approved_budget,
    )
    line = ProjectBudgetLine(
        project_id=project_id,
        tenant_id=project.tenant_id,
        concept=data.concept.strip() or "Concepto",
        hito1_budget=data.hito1_budget,
        justified_hito1=data.justified_hito1,
        hito2_budget=data.hito2_budget,
        justified_hito2=data.justified_hito2,
        approved_budget=data.approved_budget,
        percent_spent=data.percent_spent,
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
        raise ValueError("Presupuesto no encontrado para el proyecto.")

    milestones_payload: list[BudgetLineMilestoneCreate] = data.milestones or []
    if milestones_payload:
        # Recalcula totales desde hitos.
        total_amount = sum(Decimal(m.amount) for m in milestones_payload)
        total_justified = sum(Decimal(m.justified) for m in milestones_payload)
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
    approved_budget = data.approved_budget if data.approved_budget is not None else line.approved_budget

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
    if data.approved_budget is not None:
        line.approved_budget = data.approved_budget
    if data.percent_spent is not None:
        line.percent_spent = data.percent_spent
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
    project = Project(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        project_type=project_type,
        start_date=data.start_date,
        end_date=data.end_date,
        duration_months=_calculate_duration_months(data.start_date, data.end_date),
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
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else project.start_date
        end_date = data.end_date if data.end_date is not None else project.end_date
        _validate_date_range(start_date, end_date)
        project.start_date = start_date
        project.end_date = end_date
    if data.subsidy_percent is not None:
        project.subsidy_percent = Decimal(_clamp_percent(data.subsidy_percent) or 0)
    if data.is_active is not None:
        project.is_active = data.is_active

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




