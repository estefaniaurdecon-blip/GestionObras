from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.erp import Project
from app.models.message import Message
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.services.message_service import broadcast_message_to_work


class _FakeExecResult:
    def __init__(self, items):
        self._items = items

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return list(self._items)


class _FakeSession:
    def __init__(self, queued_results):
        self._queued_results = list(queued_results)
        self.added = []
        self.committed = 0

    def exec(self, _statement):
        return _FakeExecResult(self._queued_results.pop(0))

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.committed += 1


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
    is_super_admin: bool = False,
) -> User:
    user = User(
        email=f"{email_prefix}-{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        hashed_password=hash_password("temporal"),
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
    project = Project(
        tenant_id=tenant_id,
        name=name,
        created_at=utc_now(),
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


def test_work_broadcast_only_reaches_visible_permitted_members_and_not_self(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-broadcast")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor",
        full_name="Actor Broadcast",
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
    hidden_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="hidden",
        full_name="Hidden Member",
        role_name="usuario",
        creator_group_id=200,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Broadcast")

    for user in (actor, visible_member, hidden_member):
        _assign_user_to_project(
            db_session_fixture,
            tenant_id=tenant_id,
            user_id=int(user.id or 0),
            project_id=int(project.id or 0),
            created_by_id=int(actor.id or 0),
        )

    response = client.post(
        f"/api/v1/erp/projects/{int(project.id or 0)}/broadcast-message",
        headers=_auth_headers_for_user(actor, tenant_id),
        json={"message": "Mensaje a la obra"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "project_id": int(project.id or 0),
        "eligible_recipient_count": 1,
        "sent_count": 1,
        "skipped_count": 2,
    }

    rows = db_session_fixture.exec(select(Message).where(Message.tenant_id == tenant_id)).all()
    assert len(rows) == 1
    assert rows[0].from_user_id == str(int(actor.id or 0))
    assert rows[0].to_user_id == str(int(visible_member.id or 0))


def test_work_broadcast_returns_404_for_missing_or_out_of_tenant_project(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(db_session_fixture, prefix="phase4-broadcast-a")
    tenant_b = _create_tenant(db_session_fixture, prefix="phase4-broadcast-b")
    tenant_a_id = int(tenant_a.id or 0)
    tenant_b_id = int(tenant_b.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_a_id,
        email_prefix="actor-404",
        full_name="Actor 404",
        role_name="tenant_admin",
        creator_group_id=111,
    )
    project_b = _create_project(db_session_fixture, tenant_id=tenant_b_id, name="Obra Tenant B")

    missing_response = client.post(
        "/api/v1/erp/projects/999999/broadcast-message",
        headers=_auth_headers_for_user(actor, tenant_a_id),
        json={"message": "hola"},
    )
    assert missing_response.status_code == status.HTTP_404_NOT_FOUND

    other_tenant_response = client.post(
        f"/api/v1/erp/projects/{int(project_b.id or 0)}/broadcast-message",
        headers=_auth_headers_for_user(actor, tenant_a_id),
        json={"message": "hola"},
    )
    assert other_tenant_response.status_code == status.HTTP_404_NOT_FOUND


def test_work_broadcast_rejects_superadmin_from_operational_circuit(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase4-broadcast-sa")
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

    response = client.post(
        f"/api/v1/erp/projects/{int(project.id or 0)}/broadcast-message",
        headers=_auth_headers_for_user(superadmin, tenant_id, superadmin_token),
        json={"message": "mensaje prohibido"},
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_work_broadcast_deduplicates_anomalous_duplicate_recipients() -> None:
    actor = User(id=1, tenant_id=1, creator_group_id=500, is_super_admin=False, email="a@example.com", full_name="Actor", hashed_password="x", is_active=True)
    duplicate_recipient = User(id=2, tenant_id=1, creator_group_id=500, is_super_admin=False, email="b@example.com", full_name="Dup", hashed_password="x", is_active=True)
    project = Project(id=7, tenant_id=1, name="Obra Duplicada", created_at=utc_now())

    fake_session = _FakeSession(
        queued_results=[
            [project],
            [duplicate_recipient, duplicate_recipient, actor],
        ]
    )

    result = broadcast_message_to_work(
        fake_session,  # type: ignore[arg-type]
        user=actor,
        tenant_id=1,
        project_id=7,
        message="hola",
    )

    assert result.eligible_recipient_count == 1
    assert result.sent_count == 1
    assert result.skipped_count == 1
    assert len(fake_session.added) == 1
    assert isinstance(fake_session.added[0], Message)
    assert fake_session.added[0].to_user_id == "2"
