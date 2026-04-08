from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.erp import Project, WorkReport
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment


def _auth_headers_for_user(user: User, tenant_id: int, token: str | None = None) -> dict[str, str]:
    access_token = token or create_access_token(subject=str(user.id))
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Tenant-Id": str(tenant_id),
    }


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
) -> User:
    user = User(
        email=f"{email_prefix}-{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=True,
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
        created_at=datetime.utcnow(),
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _assign_user_to_project(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    project_id: int,
    created_by_id: int | None = None,
) -> None:
    session.add(
        UserWorkAssignment(
            tenant_id=tenant_id,
            user_id=user_id,
            project_id=project_id,
            created_by_id=created_by_id,
        )
    )
    session.commit()


def _create_work_report(
    session: Session,
    *,
    tenant_id: int,
    project_id: int,
    title: str | None,
    payload: dict,
) -> WorkReport:
    report = WorkReport(
        tenant_id=tenant_id,
        project_id=project_id,
        title=title,
        date=datetime.utcnow().date(),
        status="draft",
        payload=payload,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "dios@cortecelestial.god",
            "password": "temporal",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def test_work_directory_allows_dm_with_visible_member(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-dm-ok")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor",
        full_name="Actor DM",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    visible_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="visible",
        full_name="Visible Member",
        role_name="usuario",
        creator_group_id=100,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Mensajeria")

    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(visible_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    actor_headers = _auth_headers_for_user(actor, tenant_id)

    directory_response = client.get(
        "/api/v1/erp/projects/member-directory",
        headers=actor_headers,
    )
    assert directory_response.status_code == status.HTTP_200_OK
    assert directory_response.json() == [
        {
            "id": int(project.id or 0),
            "name": "Obra Mensajeria",
            "code": None,
            "visible_member_count": 2,
        }
    ]

    members_response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/members",
        headers=actor_headers,
    )
    assert members_response.status_code == status.HTTP_200_OK
    member_ids = {int(item["id"]) for item in members_response.json()}
    assert member_ids == {int(actor.id or 0), int(visible_member.id or 0)}

    send_response = client.post(
        "/api/v1/messages",
        headers=actor_headers,
        json={
            "to_user_id": str(int(visible_member.id or 0)),
            "message": "Hola desde obra",
        },
    )
    assert send_response.status_code == status.HTTP_201_CREATED
    assert send_response.json()["to_user_id"] == str(int(visible_member.id or 0))


def test_work_directory_prefers_latest_work_report_name_over_project_name(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-dm-name")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-name",
        full_name="Actor Name",
        role_name="tenant_admin",
        creator_group_id=700,
    )
    visible_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="member-name",
        full_name="Visible Name",
        role_name="usuario",
        creator_group_id=700,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Nombre ERP Legacy")

    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(visible_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    _create_work_report(
        db_session_fixture,
        tenant_id=tenant_id,
        project_id=int(project.id or 0),
        title="Parte antiguo",
        payload={"workName": "Nombre desde parte", "workNumber": "OB-700"},
    )

    actor_headers = _auth_headers_for_user(actor, tenant_id)
    directory_response = client.get(
        "/api/v1/erp/projects/member-directory",
        headers=actor_headers,
    )

    assert directory_response.status_code == status.HTTP_200_OK
    assert directory_response.json() == [
        {
            "id": int(project.id or 0),
            "name": "Nombre desde parte",
            "code": "OB-700",
            "visible_member_count": 2,
        }
    ]


def test_work_directory_keeps_latest_non_empty_work_number_from_reports(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-dm-code")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-code",
        full_name="Actor Code",
        role_name="tenant_admin",
        creator_group_id=710,
    )
    visible_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="member-code",
        full_name="Visible Code",
        role_name="usuario",
        creator_group_id=710,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Codigo")

    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(visible_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    _create_work_report(
        db_session_fixture,
        tenant_id=tenant_id,
        project_id=int(project.id or 0),
        title="Parte antiguo",
        payload={"workName": "Obra inicial", "workNumber": "OB-123"},
    )
    _create_work_report(
        db_session_fixture,
        tenant_id=tenant_id,
        project_id=int(project.id or 0),
        title="Parte reciente",
        payload={"workName": "Obra renombrada"},
    )

    actor_headers = _auth_headers_for_user(actor, tenant_id)
    directory_response = client.get(
        "/api/v1/erp/projects/member-directory",
        headers=actor_headers,
    )

    assert directory_response.status_code == status.HTTP_200_OK
    assert directory_response.json() == [
        {
            "id": int(project.id or 0),
            "name": "Obra renombrada",
            "code": "OB-123",
            "visible_member_count": 2,
        }
    ]


def test_work_directory_hides_other_group_member_but_general_dm_now_allows_same_tenant_contact(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-dm-block")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-block",
        full_name="Actor Block",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    other_group_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="hidden",
        full_name="Hidden Member",
        role_name="usuario",
        creator_group_id=200,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Bloqueada")

    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(other_group_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    actor_headers = _auth_headers_for_user(actor, tenant_id)

    directory_response = client.get(
        "/api/v1/erp/projects/member-directory",
        headers=actor_headers,
    )
    assert directory_response.status_code == status.HTTP_200_OK
    assert directory_response.json() == []

    members_response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/members",
        headers=actor_headers,
    )
    assert members_response.status_code == status.HTTP_200_OK
    assert members_response.json() == []

    send_response = client.post(
        "/api/v1/messages",
        headers=actor_headers,
        json={
            "to_user_id": str(int(other_group_member.id or 0)),
            "message": "DM general permitido aunque no salga en la obra",
        },
    )
    assert send_response.status_code == status.HTTP_201_CREATED


def test_superadmin_stays_out_of_work_dm_directory(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-dm-sa")
    tenant_id = int(tenant.id or 0)
    normal_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="normal",
        full_name="Normal User",
        role_name="tenant_admin",
        creator_group_id=333,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra SA")
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(normal_user.id or 0),
        project_id=int(project.id or 0),
    )

    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god")
    ).one()
    superadmin_token = _login_superadmin(client)
    superadmin_headers = _auth_headers_for_user(
        superadmin,
        tenant_id,
        superadmin_token,
    )

    directory_response = client.get(
        "/api/v1/erp/projects/member-directory",
        headers=superadmin_headers,
    )
    assert directory_response.status_code == status.HTTP_200_OK
    assert directory_response.json() == []

    send_response = client.post(
        "/api/v1/messages",
        headers=superadmin_headers,
        json={
            "to_user_id": str(int(normal_user.id or 0)),
            "message": "Superadmin fuera del circuito",
        },
    )
    assert send_response.status_code == status.HTTP_400_BAD_REQUEST
