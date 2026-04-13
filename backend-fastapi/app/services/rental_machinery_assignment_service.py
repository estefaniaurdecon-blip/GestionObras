from __future__ import annotations

from datetime import date as DateType, datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlmodel import Session, select

from app.models.rental_machinery_assignment import RentalMachineryAssignment
from app.models.user import User
from app.schemas.rental_machinery_assignment import (
    RentalMachineryAssignmentCreate,
    RentalMachineryAssignmentRead,
    RentalMachineryAssignmentUpdate,
)


def _to_read(row: RentalMachineryAssignment) -> RentalMachineryAssignmentRead:
    return RentalMachineryAssignmentRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        rental_machinery_id=row.rental_machinery_id,
        work_id=row.work_id,
        assignment_date=row.assignment_date,
        end_date=row.end_date,
        operator_name=row.operator_name,
        company_name=row.company_name,
        activity=row.activity,
        created_by_id=row.created_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_rental_machinery_assignments(
    session: Session,
    *,
    tenant_id: int,
    rental_machinery_id: Optional[str] = None,
    work_id: Optional[str] = None,
    assignment_date: Optional[DateType] = None,
) -> list[RentalMachineryAssignmentRead]:
    stmt = select(RentalMachineryAssignment).where(
        RentalMachineryAssignment.tenant_id == tenant_id
    )

    if rental_machinery_id:
        stmt = stmt.where(RentalMachineryAssignment.rental_machinery_id == rental_machinery_id)
    if work_id:
        stmt = stmt.where(RentalMachineryAssignment.work_id == work_id)
    if assignment_date is not None:
        stmt = stmt.where(RentalMachineryAssignment.assignment_date == assignment_date)

    stmt = stmt.order_by(
        RentalMachineryAssignment.assignment_date.desc(),
        RentalMachineryAssignment.created_at.desc(),
    )
    rows = session.exec(stmt).all()
    return [_to_read(row) for row in rows]


def create_rental_machinery_assignment(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    payload: RentalMachineryAssignmentCreate,
) -> RentalMachineryAssignmentRead:
    duplicate = session.exec(
        select(RentalMachineryAssignment).where(
            RentalMachineryAssignment.tenant_id == tenant_id,
            RentalMachineryAssignment.rental_machinery_id == payload.rental_machinery_id.strip(),
            RentalMachineryAssignment.assignment_date == payload.assignment_date,
        )
    ).first()
    if duplicate:
        raise ValueError("Ya existe una asignacion para esta maquinaria en esa fecha.")

    row = RentalMachineryAssignment(
        tenant_id=tenant_id,
        rental_machinery_id=payload.rental_machinery_id.strip(),
        work_id=payload.work_id.strip(),
        assignment_date=payload.assignment_date,
        end_date=payload.end_date,
        operator_name=payload.operator_name.strip(),
        company_name=payload.company_name.strip(),
        activity=payload.activity.strip() if payload.activity else None,
        created_by_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


def update_rental_machinery_assignment(
    session: Session,
    *,
    tenant_id: int,
    assignment_id: int,
    payload: RentalMachineryAssignmentUpdate,
) -> RentalMachineryAssignmentRead:
    row = session.exec(
        select(RentalMachineryAssignment).where(
            RentalMachineryAssignment.id == assignment_id,
            RentalMachineryAssignment.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise ValueError("Asignacion no encontrada.")

    fields_set = getattr(payload, "model_fields_set", set())

    next_assignment_date = payload.assignment_date or row.assignment_date
    if "assignment_date" in fields_set and payload.assignment_date is not None:
        duplicate = session.exec(
            select(RentalMachineryAssignment).where(
                RentalMachineryAssignment.tenant_id == tenant_id,
                RentalMachineryAssignment.rental_machinery_id == row.rental_machinery_id,
                RentalMachineryAssignment.assignment_date == next_assignment_date,
                RentalMachineryAssignment.id != assignment_id,
            )
        ).first()
        if duplicate:
            raise ValueError("Ya existe una asignacion para esta maquinaria en esa fecha.")
        row.assignment_date = next_assignment_date

    if "end_date" in fields_set:
        row.end_date = payload.end_date
    if "operator_name" in fields_set and payload.operator_name is not None:
        row.operator_name = payload.operator_name.strip()
    if "company_name" in fields_set and payload.company_name is not None:
        row.company_name = payload.company_name.strip()
    if "activity" in fields_set:
        row.activity = payload.activity.strip() if payload.activity else None

    row.updated_at = utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


def delete_rental_machinery_assignment(
    session: Session,
    *,
    tenant_id: int,
    assignment_id: int,
) -> None:
    row = session.exec(
        select(RentalMachineryAssignment).where(
            RentalMachineryAssignment.id == assignment_id,
            RentalMachineryAssignment.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise ValueError("Asignacion no encontrada.")

    session.delete(row)
    session.commit()
