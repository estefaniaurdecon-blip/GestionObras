from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.erp import Project
from app.models.notification import Notification, NotificationType
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.schemas.erp import RentalMachineryCreate, TaskCreate, WorkReportCreate, WorkReportUpdate
from app.schemas.message import MessageCreate
from app.services.erp_service import create_rental_machinery, create_task, create_work_report, update_work_report
from app.services.message_service import create_message
from app.services.user_management_service import assign_user_to_work
from app.workers.tasks import erp as erp_worker_tasks
from app.workers.tasks.erp import (
    send_rental_machinery_expiry_warnings,
    send_weekly_open_work_reports_summary,
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
    is_active: bool = True,
) -> User:
    user = User(
        email=f"{email_prefix}-{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=is_active,
        is_super_admin=False,
        tenant_id=tenant_id,
        role_id=_role_id(session, role_name),
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
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _notifications_for_user(session: Session, *, user_id: int) -> list[Notification]:
    return session.exec(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.asc(), Notification.id.asc())
    ).all()


def _bind_worker_engine(session: Session) -> None:
    erp_worker_tasks.engine = session.get_bind()


def test_create_message_creates_new_message_notification(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="notif-msg")
    tenant_id = int(tenant.id or 0)
    sender = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="sender",
        full_name="Sender User",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    recipient = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="recipient",
        full_name="Recipient User",
        role_name="usuario",
        creator_group_id=100,
    )

    create_message(
        db_session_fixture,
        user=sender,
        tenant_id=tenant_id,
        payload=MessageCreate(
            to_user_id=str(recipient.id),
            message="Necesito que revises este parte hoy.",
        ),
    )

    notifications = _notifications_for_user(db_session_fixture, user_id=int(recipient.id or 0))
    assert len(notifications) == 1
    assert notifications[0].type == NotificationType.NEW_MESSAGE
    assert "Sender User" in notifications[0].title


def test_assign_user_to_work_creates_work_assigned_notification(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="notif-work")
    tenant_id = int(tenant.id or 0)
    manager = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="manager",
        full_name="Manager User",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    worker = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="worker",
        full_name="Worker User",
        role_name="usuario",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Norte")

    assign_user_to_work(
        db_session_fixture,
        tenant_id=tenant_id,
        current_user=manager,
        user_id=int(worker.id or 0),
        work_id=int(project.id or 0),
    )

    notifications = _notifications_for_user(db_session_fixture, user_id=int(worker.id or 0))
    assert len(notifications) == 1
    assert notifications[0].type == NotificationType.WORK_ASSIGNED
    assert "Obra Norte" in notifications[0].title


def test_create_task_creates_assignment_notification(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="notif-task")
    tenant_id = int(tenant.id or 0)
    manager = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="manager-task",
        full_name="Manager Task",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    assignee = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="assignee-task",
        full_name="Assignee Task",
        role_name="usuario",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Centro")

    create_task(
        db_session_fixture,
        current_user=manager,
        data=TaskCreate(
            project_id=int(project.id or 0),
            title="Revisar entrega de material",
            assigned_to_id=int(assignee.id or 0),
        ),
        tenant_id=tenant_id,
    )

    notifications = _notifications_for_user(db_session_fixture, user_id=int(assignee.id or 0))
    assert len(notifications) == 1
    assert notifications[0].type == NotificationType.WORK_ASSIGNED
    assert "Tarea asignada" in notifications[0].title


def test_create_task_by_non_admin_does_not_create_assignment_notification(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="notif-task-user")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-task-user",
        full_name="Actor Task User",
        role_name="usuario",
        creator_group_id=100,
    )
    assignee = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="assignee-task-user",
        full_name="Assignee Task User",
        role_name="usuario",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Usuario")

    create_task(
        db_session_fixture,
        current_user=actor,
        data=TaskCreate(
            project_id=int(project.id or 0),
            title="Tarea sin aviso",
            assigned_to_id=int(assignee.id or 0),
        ),
        tenant_id=tenant_id,
    )

    notifications = _notifications_for_user(db_session_fixture, user_id=int(assignee.id or 0))
    assert notifications == []


def test_approving_work_report_notifies_creator(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="notif-approved")
    tenant_id = int(tenant.id or 0)
    creator = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="creator-wr",
        full_name="Creator WR",
        role_name="usuario",
        creator_group_id=100,
    )
    approver = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="approver-wr",
        full_name="Approver WR",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Sur")

    report = create_work_report(
        db_session_fixture,
        WorkReportCreate(
            project_id=int(project.id or 0),
            date=date.today(),
            title="Parte pendiente",
            status="pending",
            payload={"workName": "Obra Sur"},
        ),
        tenant_id,
        current_user_id=int(creator.id or 0),
    )

    update_work_report(
        db_session_fixture,
        int(report.id or 0),
        WorkReportUpdate(status="approved"),
        tenant_id,
        current_user_id=int(approver.id or 0),
    )

    notifications = _notifications_for_user(db_session_fixture, user_id=int(creator.id or 0))
    assert any(notification.type == NotificationType.WORK_REPORT_APPROVED for notification in notifications)


def test_approving_work_report_by_non_admin_does_not_notify_creator(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="notif-approved-user")
    tenant_id = int(tenant.id or 0)
    creator = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="creator-wr-user",
        full_name="Creator WR User",
        role_name="usuario",
        creator_group_id=100,
    )
    approver = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="approver-wr-user",
        full_name="Approver WR User",
        role_name="usuario",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Sur User")

    report = create_work_report(
        db_session_fixture,
        WorkReportCreate(
            project_id=int(project.id or 0),
            date=date.today(),
            title="Parte pendiente user",
            status="pending",
            payload={"workName": "Obra Sur User"},
        ),
        tenant_id,
        current_user_id=int(creator.id or 0),
    )

    update_work_report(
        db_session_fixture,
        int(report.id or 0),
        WorkReportUpdate(status="approved"),
        tenant_id,
        current_user_id=int(approver.id or 0),
    )

    notifications = _notifications_for_user(db_session_fixture, user_id=int(creator.id or 0))
    assert all(notification.type != NotificationType.WORK_REPORT_APPROVED for notification in notifications)


def test_weekly_open_work_reports_summary_is_created_once_per_week(
    db_session_fixture: Session,
) -> None:
    _bind_worker_engine(db_session_fixture)
    tenant = _create_tenant(db_session_fixture, prefix="notif-weekly")
    tenant_id = int(tenant.id or 0)
    user = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="weekly-user",
        full_name="Weekly User",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Semanal")

    create_work_report(
        db_session_fixture,
        WorkReportCreate(
            project_id=int(project.id or 0),
            date=date.today(),
            title="Parte abierto",
            status="pending",
            payload={},
        ),
        tenant_id,
        current_user_id=int(user.id or 0),
    )

    result_first = send_weekly_open_work_reports_summary(
        run_date="2026-04-13",
        tenant_id=tenant_id,
    )
    result_second = send_weekly_open_work_reports_summary(
        run_date="2026-04-13",
        tenant_id=tenant_id,
    )

    notifications = [
        notification
        for notification in _notifications_for_user(db_session_fixture, user_id=int(user.id or 0))
        if notification.type == NotificationType.WORK_REPORT_PENDING
    ]
    assert len(notifications) == 1
    assert result_first["open_reports_total"] == 1
    assert result_second["notifications_created"] >= 0


def test_rental_machinery_expiry_warning_targets_assigned_user_once_per_day(
    db_session_fixture: Session,
) -> None:
    _bind_worker_engine(db_session_fixture)
    tenant = _create_tenant(db_session_fixture, prefix="notif-rental")
    tenant_id = int(tenant.id or 0)
    manager = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="rental-manager",
        full_name="Rental Manager",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    assigned_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="rental-user",
        full_name="Rental User",
        role_name="usuario",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Maquinaria")
    db_session_fixture.add(
        UserWorkAssignment(
            tenant_id=tenant_id,
            user_id=int(assigned_user.id or 0),
            project_id=int(project.id or 0),
            created_by_id=int(manager.id or 0),
        )
    )
    db_session_fixture.commit()

    machinery = create_rental_machinery(
        db_session_fixture,
        RentalMachineryCreate(
            project_id=int(project.id or 0),
            name="Plataforma elevadora",
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 12),
            status="active",
        ),
        tenant_id,
        current_user_id=int(manager.id or 0),
    )

    send_rental_machinery_expiry_warnings(
        run_date="2026-04-09",
        tenant_id=tenant_id,
        warning_days=7,
    )
    send_rental_machinery_expiry_warnings(
        run_date="2026-04-09",
        tenant_id=tenant_id,
        warning_days=7,
    )

    notifications = [
        notification
        for notification in _notifications_for_user(db_session_fixture, user_id=int(assigned_user.id or 0))
        if notification.type == NotificationType.MACHINERY_EXPIRY_WARNING
    ]
    assert len(notifications) == 1
    assert notifications[0].reference == f"rental_machinery_expiry:{machinery.id}:2026-04-09"
