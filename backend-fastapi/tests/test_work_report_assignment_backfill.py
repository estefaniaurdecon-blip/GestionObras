from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.erp import Project, WorkReport
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.schemas.erp import WorkReportCreate, WorkReportUpdate
from app.services.erp_service import (
    backfill_user_work_assignments_from_work_reports,
    create_work_report,
    update_work_report,
)


def _role_id(session: Session, role_name: str) -> int:
    role = session.exec(select(Role).where(Role.name == role_name)).one()
    assert role.id is not None
    return int(role.id)


def _create_tenant(session: Session, *, prefix: str) -> Tenant:
    tenant = Tenant(
        name=f"{prefix}-{uuid4().hex[:8]}",
        subdomain=f"{prefix}-{uuid4().hex[:8]}",
        is_active=True,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def _create_user(
    session: Session,
    *,
    tenant_id: int,
    email_prefix: str,
    full_name: str,
    role_name: str,
    creator_group_id: int | None,
    is_super_admin: bool = False,
) -> User:
    user = User(
        email=f"{email_prefix}-{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=True,
        is_super_admin=is_super_admin,
        tenant_id=None if is_super_admin else tenant_id,
        role_id=None if is_super_admin else _role_id(session, role_name),
        creator_group_id=creator_group_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_project(session: Session, *, tenant_id: int, name: str) -> Project:
    project = Project(
        tenant_id=tenant_id,
        name=name,
        created_at=datetime.utcnow(),
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def test_create_work_report_auto_assigns_current_user_to_project(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="wr-assign-create")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-create",
        full_name="Actor Create",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Autoassign")

    report = create_work_report(
        db_session_fixture,
        WorkReportCreate(
            project_id=int(project.id or 0),
            date=datetime.utcnow().date(),
            title="Parte con asignacion",
            status="draft",
            payload={"workName": "Parte con asignacion"},
        ),
        tenant_id,
        current_user_id=int(actor.id or 0),
    )

    assignment = db_session_fixture.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == int(actor.id or 0),
            UserWorkAssignment.project_id == int(project.id or 0),
        )
    ).first()

    assert report.id is not None
    assert assignment is not None
    assert assignment.created_by_id == int(actor.id or 0)


def test_backfill_work_assignments_from_existing_reports_is_deduplicated_and_ignores_superadmin(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="wr-assign-backfill")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-backfill",
        full_name="Actor Backfill",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    editor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="editor-backfill",
        full_name="Editor Backfill",
        role_name="usuario",
        creator_group_id=200,
    )
    superadmin = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="superadmin-backfill",
        full_name="Superadmin Backfill",
        role_name="tenant_admin",
        creator_group_id=None,
        is_super_admin=True,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Backfill")

    first_report = WorkReport(
        tenant_id=tenant_id,
        project_id=int(project.id or 0),
        title="Parte 1",
        date=datetime.utcnow().date(),
        status="draft",
        payload={"workName": "Obra Backfill"},
        created_by_id=int(actor.id or 0),
        updated_by_id=int(editor.id or 0),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    second_report = WorkReport(
        tenant_id=tenant_id,
        project_id=int(project.id or 0),
        title="Parte 2",
        date=datetime.utcnow().date(),
        status="draft",
        payload={"workName": "Obra Backfill"},
        created_by_id=int(actor.id or 0),
        updated_by_id=int(superadmin.id or 0),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session_fixture.add(first_report)
    db_session_fixture.add(second_report)
    db_session_fixture.commit()

    result = backfill_user_work_assignments_from_work_reports(
        db_session_fixture,
        tenant_id=tenant_id,
    )

    assignments = db_session_fixture.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.project_id == int(project.id or 0),
        )
    ).all()

    assignment_user_ids = sorted(int(row.user_id) for row in assignments)
    assert result["reports_scanned"] == 2
    assert result["assignments_created"] == 2
    assert assignment_user_ids == [int(actor.id or 0), int(editor.id or 0)]

    result_again = backfill_user_work_assignments_from_work_reports(
        db_session_fixture,
        tenant_id=tenant_id,
    )
    assert result_again["assignments_created"] == 0


def test_update_work_report_assigns_actor_when_moving_to_new_project(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="wr-assign-update")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-update",
        full_name="Actor Update",
        role_name="tenant_admin",
        creator_group_id=300,
    )
    project_a = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra A")
    project_b = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra B")

    report = create_work_report(
        db_session_fixture,
        WorkReportCreate(
            project_id=int(project_a.id or 0),
            date=datetime.utcnow().date(),
            title="Parte mover",
            status="draft",
            payload={},
        ),
        tenant_id,
        current_user_id=int(actor.id or 0),
    )

    updated = update_work_report(
        db_session_fixture,
        int(report.id or 0),
        WorkReportUpdate(project_id=int(project_b.id or 0)),
        tenant_id,
        current_user_id=int(actor.id or 0),
    )

    assignment_b = db_session_fixture.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == int(actor.id or 0),
            UserWorkAssignment.project_id == int(project_b.id or 0),
        )
    ).first()

    assert updated.project_id == int(project_b.id or 0)
    assert assignment_b is not None
