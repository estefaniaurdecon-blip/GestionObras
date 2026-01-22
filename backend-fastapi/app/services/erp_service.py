from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import func

from app.models.erp import (
    Activity,
    Deliverable,
    Milestone,
    Project,
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
)
from app.services.notification_service import create_notification

TASK_STATUSES = {"pending", "in_progress", "done"}


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def list_projects(session: Session) -> list[Project]:
    return session.exec(
        select(Project).where(Project.is_active.is_(True)).order_by(Project.created_at.desc()),
    ).all()


def get_project(session: Session, project_id: int) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise ValueError("Proyecto no encontrado.")
    return project


def list_tasks(session: Session) -> list[Task]:
    return session.exec(
        select(Task)
        .where(Task.status != "deleted")
        .order_by(Task.created_at.desc())
    ).all()


def create_project(session: Session, data: ProjectCreate) -> Project:
    _validate_date_range(data.start_date, data.end_date)
    project = Project(
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        is_active=data.is_active,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def update_project(session: Session, project_id: int, data: ProjectUpdate) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise ValueError("Proyecto no encontrado.")

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else project.start_date
        end_date = data.end_date if data.end_date is not None else project.end_date
        _validate_date_range(start_date, end_date)
        project.start_date = start_date
        project.end_date = end_date
    if data.is_active is not None:
        project.is_active = data.is_active

    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def delete_project(session: Session, project_id: int) -> None:
    """Soft-delete de proyecto (is_active = False) para evitar problemas de FK."""
    project = session.get(Project, project_id)
    if not project:
        raise ValueError("Proyecto no encontrado.")
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


def _resolve_activity(
    session: Session,
    project_id: Optional[int],
    activity_id: Optional[int],
) -> Optional[Activity]:
    if activity_id is None:
        return None
    activity = session.get(Activity, activity_id)
    if not activity:
        raise ValueError("Actividad no encontrada.")
    if project_id and activity.project_id != project_id:
        raise ValueError("La actividad no pertenece al proyecto indicado.")
    return activity


def _resolve_subactivity(
    session: Session,
    project_id: Optional[int],
    subactivity_id: Optional[int],
) -> Optional[SubActivity]:
    if subactivity_id is None:
        return None
    subactivity = session.get(SubActivity, subactivity_id)
    if not subactivity:
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
) -> Optional[TaskTemplate]:
    if task_template_id is None:
        return None
    template = session.get(TaskTemplate, task_template_id)
    if not template:
        raise ValueError("Plantilla de tarea no encontrada.")
    if not template.is_active:
        raise ValueError("La plantilla de tarea no esta activa.")
    return template


def _resolve_milestone(
    session: Session,
    milestone_id: int,
) -> Milestone:
    milestone = session.get(Milestone, milestone_id)
    if not milestone:
        raise ValueError("Hito no encontrado.")
    return milestone


def create_task(session: Session, current_user: User, data: TaskCreate) -> Task:
    project_id = data.project_id
    if project_id is not None and not session.get(Project, project_id):
        raise ValueError("Proyecto no encontrado.")

    # Resolver dependencias jerarquicas si se proporcionan.
    subactivity = _resolve_subactivity(session, project_id, data.subactivity_id)
    if subactivity:
        activity = session.get(Activity, subactivity.activity_id)
        if activity and not project_id:
            project_id = activity.project_id
    _resolve_task_template(session, data.task_template_id)

    assignee = _resolve_assignee(session, current_user, data.assigned_to_id)
    _validate_date_range(data.start_date, data.end_date)

    status = _normalize_task_status(data.status, data.is_completed)
    task = Task(
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
) -> Task:
    task = session.get(Task, task_id)
    if not task:
        raise ValueError("Tarea no encontrada.")

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.project_id is not None:
        if data.project_id is not None and not session.get(Project, data.project_id):
            raise ValueError("Proyecto no encontrado.")
        task.project_id = data.project_id
    if data.subactivity_id is not None:
        _resolve_subactivity(session, task.project_id, data.subactivity_id)
        task.subactivity_id = data.subactivity_id
    if data.task_template_id is not None:
        _resolve_task_template(session, data.task_template_id)
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


def delete_task(session: Session, task_id: int) -> None:
    task = session.get(Task, task_id)
    if not task:
        raise ValueError("Tarea no encontrada.")
    # Soft delete: marca la tarea como eliminada para que no aparezca en los listados.
    task.status = "deleted"
    task.is_completed = True
    task.subactivity_id = None
    session.add(task)
    session.commit()


def list_task_templates(session: Session) -> list[TaskTemplate]:
    return session.exec(
        select(TaskTemplate).order_by(TaskTemplate.created_at.desc()),
    ).all()


def create_task_template(session: Session, data: TaskTemplateCreate) -> TaskTemplate:
    template = TaskTemplate(
        title=data.title,
        description=data.description,
        is_active=data.is_active,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def list_activities(session: Session, project_id: Optional[int] = None) -> list[Activity]:
    stmt = select(Activity)
    if project_id is not None:
        stmt = stmt.where(Activity.project_id == project_id)
    return session.exec(stmt.order_by(Activity.created_at.desc())).all()


def create_activity(session: Session, data: ActivityCreate) -> Activity:
    if not session.get(Project, data.project_id):
        raise ValueError("Proyecto no encontrado.")
    _validate_date_range(data.start_date, data.end_date)
    activity = Activity(
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


def update_activity(session: Session, activity_id: int, data: ActivityUpdate) -> Activity:
    activity = session.get(Activity, activity_id)
    if not activity:
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
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[SubActivity]:
    stmt = select(SubActivity)
    if activity_id is not None:
        stmt = stmt.where(SubActivity.activity_id == activity_id)
    if project_id is not None:
        stmt = (
            stmt.join(Activity, Activity.id == SubActivity.activity_id)
            .where(Activity.project_id == project_id)
        )
    return session.exec(stmt.order_by(SubActivity.created_at.desc())).all()


def create_subactivity(session: Session, data: SubActivityCreate) -> SubActivity:
    activity = session.get(Activity, data.activity_id)
    if not activity:
        raise ValueError("Actividad no encontrada.")
    _validate_date_range(data.start_date, data.end_date)
    subactivity = SubActivity(
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


def update_subactivity(session: Session, subactivity_id: int, data: SubActivityUpdate) -> SubActivity:
    subactivity = session.get(SubActivity, subactivity_id)
    if not subactivity:
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
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[Milestone]:
    stmt = select(Milestone)
    if project_id is not None:
        stmt = stmt.where(Milestone.project_id == project_id)
    if activity_id is not None:
        stmt = stmt.where(Milestone.activity_id == activity_id)
    return session.exec(stmt.order_by(Milestone.created_at.desc())).all()


def create_milestone(session: Session, data: MilestoneCreate) -> Milestone:
    if not session.get(Project, data.project_id):
        raise ValueError("Proyecto no encontrado.")
    _resolve_activity(session, data.project_id, data.activity_id)
    milestone = Milestone(
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


def update_milestone(session: Session, milestone_id: int, data: MilestoneUpdate) -> Milestone:
    milestone = session.get(Milestone, milestone_id)
    if not milestone:
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
    milestone_id: Optional[int] = None,
) -> list[Deliverable]:
    stmt = select(Deliverable)
    if milestone_id is not None:
        stmt = stmt.where(Deliverable.milestone_id == milestone_id)
    return session.exec(stmt.order_by(Deliverable.created_at.desc())).all()


def create_deliverable(session: Session, data: DeliverableCreate) -> Deliverable:
    milestone = _resolve_milestone(session, data.milestone_id)
    submitted_at = _as_aware(data.submitted_at or datetime.now(timezone.utc))
    is_late = False
    if milestone.due_date and submitted_at > _as_aware(milestone.due_date):
        is_late = True
        if not milestone.allow_late_submission:
            raise ValueError("Entrega fuera de plazo para este hito.")

    deliverable = Deliverable(
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


def update_deliverable(session: Session, deliverable_id: int, data: DeliverableUpdate) -> Deliverable:
    deliverable = session.get(Deliverable, deliverable_id)
    if not deliverable:
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

    milestone = _resolve_milestone(session, deliverable.milestone_id)
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


def get_active_time_session(session: Session, user: User) -> Optional[TimeSession]:
    return session.exec(
        select(TimeSession)
        .where(TimeSession.user_id == user.id, TimeSession.is_active.is_(True))
        .order_by(TimeSession.started_at.desc()),
    ).one_or_none()


def start_time_session(session: Session, user: User, task_id: int) -> TimeSession:
    task = session.get(Task, task_id)
    if not task:
        raise ValueError("Tarea no encontrada")

    active = get_active_time_session(session, user)
    now = datetime.now(timezone.utc)

    if active:
        active_ended = _as_aware(active.ended_at or now)
        active_started = _as_aware(active.started_at)
        active.ended_at = active_ended
        delta = active_ended - active_started
        active.duration_seconds = max(0, int(delta.total_seconds()))
        active.is_active = False
        session.add(active)

        hours_decimal = Decimal(active.duration_seconds) / Decimal(3600)
        hours_decimal = hours_decimal.quantize(Decimal("0.01"))
        session.add(
            TimeEntry(
                task_id=active.task_id,
                user_id=user.id,
                time_session_id=active.id,
                hours=hours_decimal,
                description="Generado automaticamente desde control de tiempo",
                created_at=now,
            ),
        )

    new_session = TimeSession(
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


def stop_time_session(session: Session, user: User) -> Optional[TimeSession]:
    active = get_active_time_session(session, user)
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

    hours_decimal = Decimal(active.duration_seconds) / Decimal(3600)
    hours_decimal = hours_decimal.quantize(Decimal("0.01"))
    session.add(
        TimeEntry(
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
        stmt = stmt.where(Task.project_id == project_id)
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
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[TimeSession]:
    stmt = select(TimeSession).where(TimeSession.user_id == user.id)
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
) -> TimeSession:
    task = session.get(Task, task_id)
    if not task:
        raise ValueError("Tarea no encontrada")

    started = _as_aware(started_at)
    ended = _as_aware(ended_at)
    if ended <= started:
        raise ValueError("La fecha de fin debe ser posterior al inicio")

    duration_seconds = max(0, int((ended - started).total_seconds()))
    new_session = TimeSession(
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
) -> TimeSession:
    ts = session.get(TimeSession, session_id)
    if not ts or ts.user_id != user.id:
        raise ValueError("Sesion no encontrada")

    if task_id is not None:
        task = session.get(Task, task_id)
        if not task:
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

    return ts


def delete_time_session(session: Session, user: User, session_id: int) -> None:
    ts = session.get(TimeSession, session_id)
    if not ts or ts.user_id != user.id:
        raise ValueError("Sesion no encontrada")

    entries = session.exec(
        select(TimeEntry).where(TimeEntry.time_session_id == ts.id),
    ).all()
    for entry in entries:
        session.delete(entry)
    session.delete(ts)
    session.commit()


