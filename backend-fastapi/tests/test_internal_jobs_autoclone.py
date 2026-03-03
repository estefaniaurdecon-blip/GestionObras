from datetime import date
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.api import deps as api_deps
from app.main import app
from app.core.security import hash_password
from app.models.erp import Project, WorkReport
from app.models.job_run_lock import JobRunLock
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.services.work_report_autoclone_service import AUTO_DUPLICATE_JOB_NAME
from app.services.work_report_autoclone_service import (
    run_auto_duplicate_rental_machinery_for_date,
)


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant(session: Session, *, prefix: str) -> Tenant:
    suffix = uuid4().hex[:8]
    tenant = Tenant(
        name=f"{prefix}-{suffix}",
        subdomain=f"{prefix.lower()}-{suffix}",
        is_active=True,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def _create_project(session: Session, *, tenant_id: int, name: str) -> Project:
    project = Project(
        tenant_id=tenant_id,
        name=name,
        is_active=True,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _create_user_with_role(
    session: Session,
    *,
    tenant_id: int,
    email: str,
    password: str,
    role_name: str,
) -> User:
    role = session.exec(select(Role).where(Role.name == role_name)).one()
    user = User(
        email=email,
        full_name=f"User {role_name}",
        hashed_password=hash_password(password),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant_id,
        role_id=role.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _get_superadmin_user(session: Session) -> User:
    return session.exec(
        select(User).where(User.email == "dios@cortecelestial.god")
    ).one()


def test_autoclone_service_is_idempotent_per_tenant_job_and_date(
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="job-lock")
    project = _create_project(db_session_fixture, tenant_id=tenant.id, name="Proyecto lock")

    source = WorkReport(
        tenant_id=tenant.id,
        project_id=project.id,
        date=date(2026, 2, 10),
        title="Parte origen",
        status="draft",
        payload={
            "workNumber": "WR-LOCK-001",
            "workId": "W-001",
            "workName": "Obra lock",
            "autoCloneNextDay": True,
            "materialGroups": [{"documentImage": "should-not-be-copied"}],
            "rentalMachineryGroups": [
                {
                    "items": [
                        {
                            "deliveryDate": "2026-02-01",
                            "dailyRate": 50,
                            "assignments": [{"startDate": "2026-02-01"}],
                        }
                    ]
                }
            ],
        },
    )
    db_session_fixture.add(source)
    db_session_fixture.commit()
    db_session_fixture.refresh(source)

    first_run = run_auto_duplicate_rental_machinery_for_date(
        target_date=date(2026, 2, 11),
        tenant_id=tenant.id,
    )
    second_run = run_auto_duplicate_rental_machinery_for_date(
        target_date=date(2026, 2, 11),
        tenant_id=tenant.id,
    )

    cloned_reports = db_session_fixture.exec(
        select(WorkReport).where(
            WorkReport.tenant_id == tenant.id,
            WorkReport.date == date(2026, 2, 11),
            WorkReport.deleted_at.is_(None),
        )
    ).all()
    assert len(cloned_reports) == 1
    assert first_run.created_reports == 1
    assert second_run.created_reports == 0
    assert second_run.lock_skips == 1

    db_session_fixture.expire_all()
    source_after = db_session_fixture.get(WorkReport, source.id)
    assert source_after is not None
    assert source_after.payload.get("autoCloneNextDay") is False

    locks = db_session_fixture.exec(
        select(JobRunLock).where(
            JobRunLock.tenant_id == tenant.id,
            JobRunLock.job_name == AUTO_DUPLICATE_JOB_NAME,
            JobRunLock.run_date == date(2026, 2, 11),
        )
    ).all()
    assert len(locks) == 1
    assert locks[0].status == "completed"


def test_internal_job_endpoint_requires_permissions_and_returns_202(
    client: TestClient,
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="job-endpoint")
    no_manage_user = _create_user_with_role(
        db_session_fixture,
        tenant_id=tenant.id,
        email=f"user-{uuid4().hex[:8]}@example.com",
        password="user-pass-123",
        role_name="user",
    )
    manage_user = _create_user_with_role(
        db_session_fixture,
        tenant_id=tenant.id,
        email=f"manager-{uuid4().hex[:8]}@example.com",
        password="manager-pass-123",
        role_name="tenant_admin",
    )
    superadmin = _get_superadmin_user(db_session_fixture)

    captured_kwargs: dict = {}

    class _FakeTaskResult:
        id = "job-test-123"

    def _fake_apply_async(*, kwargs):
        captured_kwargs.update(kwargs)
        return _FakeTaskResult()

    from app.api.v1 import internal as internal_api

    monkeypatch.setattr(
        internal_api.auto_duplicate_rental_machinery_daily,
        "apply_async",
        _fake_apply_async,
    )

    app.dependency_overrides.pop(api_deps.get_current_active_user, None)
    unauthorized = client.post("/api/v1/internal/jobs/auto-duplicate-rental-machinery")
    assert unauthorized.status_code == status.HTTP_401_UNAUTHORIZED

    try:
        app.dependency_overrides[api_deps.get_current_active_user] = lambda: no_manage_user
        forbidden = client.post(
            "/api/v1/internal/jobs/auto-duplicate-rental-machinery",
            json={"run_date": "2026-02-12", "tenant_id": tenant.id},
        )
        assert forbidden.status_code == status.HTTP_403_FORBIDDEN

        app.dependency_overrides[api_deps.get_current_active_user] = lambda: manage_user
        scheduled = client.post(
            "/api/v1/internal/jobs/auto-duplicate-rental-machinery",
            json={"run_date": "2026-02-12", "tenant_id": tenant.id},
        )
        assert scheduled.status_code == status.HTTP_202_ACCEPTED, scheduled.text
        body = scheduled.json()
        assert body["scheduled"] is True
        assert body["job_id"] == "job-test-123"
        assert body["task_name"] == "auto_duplicate_rental_machinery_daily"
        assert captured_kwargs["run_date"] == "2026-02-12"
        assert captured_kwargs["tenant_id"] == tenant.id
        assert captured_kwargs["requested_by_user_id"] == manage_user.id

        app.dependency_overrides[api_deps.get_current_active_user] = lambda: superadmin
        scheduled_superadmin = client.post(
            "/api/v1/internal/jobs/auto-duplicate-rental-machinery",
            json={"run_date": "2026-02-13", "tenant_id": tenant.id},
        )
        assert scheduled_superadmin.status_code == status.HTTP_202_ACCEPTED
    finally:
        app.dependency_overrides.pop(api_deps.get_current_active_user, None)
