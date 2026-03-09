from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.erp import Project, WorkReport
from app.models.phase import Phase
from app.models.user import User
from app.schemas.phase import PhaseCreate, PhaseRead, PhaseUpdate


def _to_read(row: Phase, work_name: Optional[str] = None) -> PhaseRead:
    return PhaseRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        project_id=row.project_id,
        name=row.name,
        description=row.description,
        responsible=row.responsible,
        start_date=row.start_date,
        end_date=row.end_date,
        status=row.status,  # type: ignore[arg-type]
        progress=row.progress,
        created_by_id=row.created_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        work_name=work_name,
    )


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _validate_date_range(start_date, end_date) -> None:
    if end_date < start_date:
        raise ValueError("La fecha de fin debe ser posterior o igual a la fecha de inicio.")


def _validate_project_scope(
    session: Session,
    *,
    tenant_id: int,
    project_id: Optional[int],
) -> None:
    if project_id is None:
        return
    project = session.exec(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == tenant_id,
        )
    ).first()
    if not project:
        raise ValueError("Obra no encontrada para el tenant indicado.")


def get_phase(
    session: Session,
    *,
    tenant_id: int,
    phase_id: int,
) -> Optional[Phase]:
    return session.exec(
        select(Phase).where(
            Phase.id == phase_id,
            Phase.tenant_id == tenant_id,
        )
    ).first()


def list_phases(
    session: Session,
    *,
    tenant_id: int,
) -> list[PhaseRead]:
    rows = session.exec(
        select(Phase)
        .where(Phase.tenant_id == tenant_id)
        .order_by(Phase.created_at.asc())
    ).all()
    if not rows:
        return []

    project_ids = {int(row.project_id) for row in rows if row.project_id is not None}
    projects_by_id: dict[int, Project] = {}
    if project_ids:
        projects = session.exec(
            select(Project).where(
                Project.tenant_id == tenant_id,
                Project.id.in_(project_ids),
            )
        ).all()
        projects_by_id = {int(project.id or 0): project for project in projects if project.id is not None}

    result: list[PhaseRead] = []
    for row in rows:
        work_name: Optional[str] = None
        if row.project_id is not None:
            project = projects_by_id.get(int(row.project_id))
            if project:
                work_name = project.name
        result.append(_to_read(row, work_name=work_name))
    return result


def create_phase(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    payload: PhaseCreate,
) -> PhaseRead:
    _validate_date_range(payload.start_date, payload.end_date)
    _validate_project_scope(session, tenant_id=tenant_id, project_id=payload.project_id)

    row = Phase(
        tenant_id=tenant_id,
        project_id=payload.project_id,
        name=payload.name.strip(),
        description=_normalize_optional_text(payload.description),
        responsible=_normalize_optional_text(payload.responsible),
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        progress=payload.progress,
        created_by_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)

    work_name: Optional[str] = None
    if row.project_id is not None:
        project = session.get(Project, row.project_id)
        if project and project.tenant_id == tenant_id:
            work_name = project.name
    return _to_read(row, work_name=work_name)


def update_phase(
    session: Session,
    *,
    tenant_id: int,
    phase_id: int,
    payload: PhaseUpdate,
) -> PhaseRead:
    row = get_phase(session, tenant_id=tenant_id, phase_id=phase_id)
    if not row:
        raise ValueError("Fase no encontrada.")

    if payload.project_id is not None:
        _validate_project_scope(session, tenant_id=tenant_id, project_id=payload.project_id)
        row.project_id = payload.project_id
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.description is not None:
        row.description = _normalize_optional_text(payload.description)
    if payload.responsible is not None:
        row.responsible = _normalize_optional_text(payload.responsible)
    if payload.start_date is not None:
        row.start_date = payload.start_date
    if payload.end_date is not None:
        row.end_date = payload.end_date
    if payload.status is not None:
        row.status = payload.status
    if payload.progress is not None:
        row.progress = payload.progress

    _validate_date_range(row.start_date, row.end_date)
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)

    work_name: Optional[str] = None
    if row.project_id is not None:
        project = session.get(Project, row.project_id)
        if project and project.tenant_id == tenant_id:
            work_name = project.name
    return _to_read(row, work_name=work_name)


def phase_has_children(
    session: Session,
    *,
    tenant_id: int,
    phase_id: int,
) -> bool:
    row = get_phase(session, tenant_id=tenant_id, phase_id=phase_id)
    if not row or row.project_id is None:
        return False

    report = session.exec(
        select(WorkReport.id).where(
            WorkReport.tenant_id == tenant_id,
            WorkReport.project_id == row.project_id,
            WorkReport.date >= row.start_date,
            WorkReport.date <= row.end_date,
            WorkReport.deleted_at.is_(None),
        )
    ).first()
    return report is not None


def delete_phase(
    session: Session,
    *,
    tenant_id: int,
    phase_id: int,
) -> None:
    row = get_phase(session, tenant_id=tenant_id, phase_id=phase_id)
    if not row:
        raise ValueError("Fase no encontrada.")

    if phase_has_children(session, tenant_id=tenant_id, phase_id=phase_id):
        raise RuntimeError("PHASE_HAS_CHILDREN")

    session.delete(row)
    session.commit()
