from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.erp import Project
from app.models.mfa_email_code import MFAEmailCode
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment


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
    tenant_id: int | None,
    email_prefix: str,
    full_name: str,
    role_name: str,
    creator_group_id: int | None,
    is_super_admin: bool = False,
) -> User:
    user = User(
        email=f"{email_prefix}-{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        hashed_password=hash_password("temporal123"),
        is_active=True,
        is_super_admin=is_super_admin,
        tenant_id=tenant_id,
        role_id=_role_id(session, role_name),
        creator_group_id=creator_group_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_project(session: Session, *, tenant_id: int, name: str) -> Project:
    project = Project(tenant_id=tenant_id, name=name, created_at=utc_now())
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


def _login_user(
    client: TestClient,
    db_session_fixture: Session | None,
    *,
    email: str,
    password: str,
) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    if body["mfa_required"] is False:
        return body["access_token"]
    assert db_session_fixture is not None

    user = db_session_fixture.exec(select(User).where(User.email == email)).one()
    mfa_record = db_session_fixture.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()
    code = "654321"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db_session_fixture.add(mfa_record)
    db_session_fixture.commit()

    verify_response = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": email, "mfa_code": code},
    )
    assert verify_response.status_code == status.HTTP_200_OK
    verify_body = verify_response.json()
    assert verify_body["mfa_required"] is False
    return verify_body["access_token"]


def _login_superadmin(client: TestClient) -> str:
    return _login_user(
        client,
        db_session_fixture=None,
        email="dios@cortecelestial.god",
        password="temporal",
    )


def test_work_members_endpoint_returns_only_visible_members_in_actor_scope(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-visible")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor",
        full_name="Actor Visible",
        role_name="tenant_admin",
        creator_group_id=100,
    )
    same_group_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="same-group",
        full_name="Same Group Member",
        role_name="usuario",
        creator_group_id=100,
    )
    other_group_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="other-group",
        full_name="Other Group Member",
        role_name="usuario",
        creator_group_id=200,
    )
    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god")
    ).one()
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Fase 4")

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
        user_id=int(same_group_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(other_group_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(superadmin.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    token = _login_user(
        client,
        db_session_fixture,
        email=actor.email,
        password="temporal123",
    )
    response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/members",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == status.HTTP_200_OK
    returned_ids = {int(item["id"]) for item in response.json()}
    assert returned_ids == {int(actor.id or 0), int(same_group_member.id or 0)}


def test_work_members_endpoint_does_not_leak_cross_group_members(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-cross")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-cross",
        full_name="Actor Cross",
        role_name="tenant_admin",
        creator_group_id=300,
    )
    other_group_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="hidden-member",
        full_name="Hidden Member",
        role_name="usuario",
        creator_group_id=999,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Cruzada")

    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(other_group_member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    token = _login_user(
        client,
        db_session_fixture,
        email=actor.email,
        password="temporal123",
    )
    response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/members",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


def test_work_members_endpoint_returns_404_for_missing_or_out_of_tenant_project(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(db_session_fixture, prefix="phase4-tenant-a")
    tenant_b = _create_tenant(db_session_fixture, prefix="phase4-tenant-b")
    tenant_a_id = int(tenant_a.id or 0)
    tenant_b_id = int(tenant_b.id or 0)
    project_b = _create_project(db_session_fixture, tenant_id=tenant_b_id, name="Obra Tenant B")

    super_token = _login_superadmin(client)

    missing_response = client.get(
        "/api/v1/erp/projects/999999/members",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-Id": str(tenant_a_id),
        },
    )
    assert missing_response.status_code == status.HTTP_404_NOT_FOUND

    out_of_tenant_response = client.get(
        f"/api/v1/erp/projects/{int(project_b.id or 0)}/members",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-Id": str(tenant_a_id),
        },
    )
    assert out_of_tenant_response.status_code == status.HTTP_404_NOT_FOUND
