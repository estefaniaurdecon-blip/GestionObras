from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.erp import Project
from app.models.mfa_email_code import MFAEmailCode
from app.models.project_conversation import (
    ProjectConversation,
    ProjectConversationMessage,
    ProjectConversationParticipant,
)
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.services import project_conversation_service


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
    project = Project(tenant_id=tenant_id, name=name, created_at=datetime.utcnow())
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


def test_project_conversation_shell_is_created_then_reused_per_tenant_project_group(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-shell")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-shell",
        full_name="Actor Shell",
        role_name="tenant_admin",
        creator_group_id=101,
    )
    visible_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="member-shell",
        full_name="Member Shell",
        role_name="usuario",
        creator_group_id=101,
    )
    hidden_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="hidden-shell",
        full_name="Hidden Shell",
        role_name="usuario",
        creator_group_id=202,
    )
    superadmin = db_session_fixture.exec(select(User).where(User.email == "dios@cortecelestial.god")).one()
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Shell")

    for target in (actor, visible_member, hidden_member, superadmin):
        _assign_user_to_project(
            db_session_fixture,
            tenant_id=tenant_id,
            user_id=int(target.id or 0),
            project_id=int(project.id or 0),
            created_by_id=int(actor.id or 0),
        )

    token = _login_user(client, db_session_fixture, email=actor.email, password="temporal123")
    headers = {"Authorization": f"Bearer {token}"}

    first = client.get(f"/api/v1/erp/projects/{int(project.id or 0)}/conversation", headers=headers)
    assert first.status_code == status.HTTP_200_OK
    first_body = first.json()
    assert first_body["created_now"] is True
    assert first_body["conversation"]["project_id"] == int(project.id or 0)
    assert first_body["conversation"]["creator_group_id"] == 101
    returned_participant_ids = {item["user_id"] for item in first_body["participants"]}
    assert returned_participant_ids == {int(actor.id or 0), int(visible_member.id or 0)}

    second = client.get(f"/api/v1/erp/projects/{int(project.id or 0)}/conversation", headers=headers)
    assert second.status_code == status.HTTP_200_OK
    second_body = second.json()
    assert second_body["created_now"] is False
    assert second_body["conversation"]["id"] == first_body["conversation"]["id"]

    conversations = db_session_fixture.exec(select(ProjectConversation)).all()
    assert len(conversations) == 1
    participants = db_session_fixture.exec(select(ProjectConversationParticipant)).all()
    assert len(participants) == 2


def test_project_conversation_shell_is_scoped_per_group_for_same_project(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-groups")
    tenant_id = int(tenant.id or 0)
    actor_group_a = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-a",
        full_name="Actor Group A",
        role_name="tenant_admin",
        creator_group_id=301,
    )
    actor_group_b = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-b",
        full_name="Actor Group B",
        role_name="tenant_admin",
        creator_group_id=302,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Dos Grupos")

    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor_group_a.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor_group_a.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor_group_b.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor_group_b.id or 0),
    )

    token_a = _login_user(client, db_session_fixture, email=actor_group_a.email, password="temporal123")
    token_b = _login_user(client, db_session_fixture, email=actor_group_b.email, password="temporal123")

    response_a = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    response_b = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response_a.status_code == status.HTTP_200_OK
    assert response_b.status_code == status.HTTP_200_OK
    assert response_a.json()["conversation"]["creator_group_id"] == 301
    assert response_b.json()["conversation"]["creator_group_id"] == 302
    assert response_a.json()["conversation"]["id"] != response_b.json()["conversation"]["id"]


def test_project_conversation_shell_rejects_superadmin_from_normal_operational_circuit(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-super")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-super",
        full_name="Actor Super",
        role_name="tenant_admin",
        creator_group_id=401,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Super")
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    super_token = _login_superadmin(client)
    response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-Id": str(tenant_id),
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_project_conversation_shell_returns_404_for_missing_or_out_of_tenant_project(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(db_session_fixture, prefix="phase5-tenant-a")
    tenant_b = _create_tenant(db_session_fixture, prefix="phase5-tenant-b")
    tenant_a_id = int(tenant_a.id or 0)
    tenant_b_id = int(tenant_b.id or 0)
    project_b = _create_project(db_session_fixture, tenant_id=tenant_b_id, name="Obra Tenant B")

    super_token = _login_superadmin(client)

    missing_response = client.get(
        "/api/v1/erp/projects/999999/conversation",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-Id": str(tenant_a_id),
        },
    )
    assert missing_response.status_code == status.HTTP_404_NOT_FOUND

    out_of_tenant_response = client.get(
        f"/api/v1/erp/projects/{int(project_b.id or 0)}/conversation",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-Id": str(tenant_a_id),
        },
    )
    assert out_of_tenant_response.status_code == status.HTTP_404_NOT_FOUND


def test_project_conversation_shell_deduplicates_anomalous_duplicate_assignments(
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-dup")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-dup",
        full_name="Actor Dup",
        role_name="tenant_admin",
        creator_group_id=501,
    )
    same_group_member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="member-dup",
        full_name="Member Dup",
        role_name="usuario",
        creator_group_id=501,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Dup")

    original_loader = project_conversation_service._load_assigned_users

    def _fake_load_assigned_users(session: Session, *, tenant_id: int, project_id: int) -> list[User]:
        assert tenant_id == int(tenant.id or 0)
        assert project_id == int(project.id or 0)
        return [actor, same_group_member, actor, same_group_member]

    monkeypatch.setattr(project_conversation_service, "_load_assigned_users", _fake_load_assigned_users)
    try:
        shell = project_conversation_service.get_or_create_project_conversation_shell(
            db_session_fixture,
            actor=actor,
            tenant_id=tenant_id,
            project_id=int(project.id or 0),
        )
    finally:
        monkeypatch.setattr(project_conversation_service, "_load_assigned_users", original_loader)

    assert {item.user_id for item in shell.participants} == {int(actor.id or 0), int(same_group_member.id or 0)}
    participants = db_session_fixture.exec(
        select(ProjectConversationParticipant).where(
            ProjectConversationParticipant.project_id == int(project.id or 0),
            ProjectConversationParticipant.creator_group_id == 501,
        )
    ).all()
    assert len(participants) == 2


def test_project_conversation_active_participant_can_send_and_list_messages(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-msg")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-msg",
        full_name="Actor Mensajes",
        role_name="tenant_admin",
        creator_group_id=601,
    )
    member = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="member-msg",
        full_name="Member Mensajes",
        role_name="usuario",
        creator_group_id=601,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Mensajes")
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
        user_id=int(member.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    token = _login_user(client, db_session_fixture, email=actor.email, password="temporal123")
    headers = {"Authorization": f"Bearer {token}"}

    first_post = client.post(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation/messages",
        headers=headers,
        json={"message": "Primer mensaje de obra"},
    )
    assert first_post.status_code == status.HTTP_201_CREATED
    first_body = first_post.json()
    assert first_body["project_id"] == int(project.id or 0)
    assert first_body["from_user_id"] == int(actor.id or 0)
    assert first_body["from_user"]["full_name"] == actor.full_name

    second_post = client.post(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation/messages",
        headers=headers,
        json={"message": "Segundo mensaje de obra"},
    )
    assert second_post.status_code == status.HTTP_201_CREATED
    second_body = second_post.json()
    assert second_body["conversation_id"] == first_body["conversation_id"]

    list_response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation/messages",
        headers=headers,
    )
    assert list_response.status_code == status.HTTP_200_OK
    list_body = list_response.json()
    assert list_body["conversation"]["project_id"] == int(project.id or 0)
    assert [item["message"] for item in list_body["items"]] == [
        "Primer mensaje de obra",
        "Segundo mensaje de obra",
    ]
    assert list_body["items"][0]["conversation_id"] == first_body["conversation_id"]

    conversation = db_session_fixture.exec(
        select(ProjectConversation).where(ProjectConversation.id == first_body["conversation_id"])
    ).one()
    assert conversation.last_message_at is not None
    assert conversation.updated_at >= conversation.created_at

    stored_messages = db_session_fixture.exec(
        select(ProjectConversationMessage).where(
            ProjectConversationMessage.conversation_id == int(first_body["conversation_id"])
        )
    ).all()
    assert len(stored_messages) == 2


def test_project_conversation_messages_are_scoped_per_group_for_same_project(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-msg-groups")
    tenant_id = int(tenant.id or 0)
    actor_group_a = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-msg-a",
        full_name="Actor Mensajes A",
        role_name="tenant_admin",
        creator_group_id=701,
    )
    actor_group_b = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-msg-b",
        full_name="Actor Mensajes B",
        role_name="tenant_admin",
        creator_group_id=702,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Mensajes Grupos")
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor_group_a.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor_group_a.id or 0),
    )
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor_group_b.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor_group_b.id or 0),
    )

    token_a = _login_user(client, db_session_fixture, email=actor_group_a.email, password="temporal123")
    token_b = _login_user(client, db_session_fixture, email=actor_group_b.email, password="temporal123")

    post_a = client.post(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation/messages",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"message": "Mensaje grupo A"},
    )
    assert post_a.status_code == status.HTTP_201_CREATED

    list_b = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation/messages",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert list_b.status_code == status.HTTP_200_OK
    body_b = list_b.json()
    assert body_b["items"] == []
    assert body_b["conversation"]["creator_group_id"] == 702
    assert body_b["conversation"]["id"] != post_a.json()["conversation_id"]


def test_project_conversation_inactive_participant_cannot_send(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, prefix="phase5-inactive")
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email_prefix="actor-inactive",
        full_name="Actor Inactive",
        role_name="tenant_admin",
        creator_group_id=801,
    )
    project = _create_project(db_session_fixture, tenant_id=tenant_id, name="Obra Inactiva")
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_id,
        user_id=int(actor.id or 0),
        project_id=int(project.id or 0),
        created_by_id=int(actor.id or 0),
    )

    token = _login_user(client, db_session_fixture, email=actor.email, password="temporal123")
    headers = {"Authorization": f"Bearer {token}"}

    shell_response = client.get(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation",
        headers=headers,
    )
    assert shell_response.status_code == status.HTTP_200_OK

    assignment = db_session_fixture.exec(
        select(UserWorkAssignment).where(
            UserWorkAssignment.tenant_id == tenant_id,
            UserWorkAssignment.user_id == int(actor.id or 0),
            UserWorkAssignment.project_id == int(project.id or 0),
        )
    ).one()
    db_session_fixture.delete(assignment)
    db_session_fixture.commit()

    post_response = client.post(
        f"/api/v1/erp/projects/{int(project.id or 0)}/conversation/messages",
        headers=headers,
        json={"message": "Mensaje tras salir"},
    )
    assert post_response.status_code == status.HTTP_403_FORBIDDEN


def test_project_conversation_messages_reject_superadmin_and_missing_or_out_of_tenant_project(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(db_session_fixture, prefix="phase5-msg-tenant-a")
    tenant_b = _create_tenant(db_session_fixture, prefix="phase5-msg-tenant-b")
    tenant_a_id = int(tenant_a.id or 0)
    tenant_b_id = int(tenant_b.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_a_id,
        email_prefix="actor-msg-tenant",
        full_name="Actor Tenant",
        role_name="tenant_admin",
        creator_group_id=901,
    )
    project_a = _create_project(db_session_fixture, tenant_id=tenant_a_id, name="Obra Tenant A")
    project_b = _create_project(db_session_fixture, tenant_id=tenant_b_id, name="Obra Tenant B")
    _assign_user_to_project(
        db_session_fixture,
        tenant_id=tenant_a_id,
        user_id=int(actor.id or 0),
        project_id=int(project_a.id or 0),
        created_by_id=int(actor.id or 0),
    )

    super_token = _login_superadmin(client)

    super_list = client.get(
        f"/api/v1/erp/projects/{int(project_a.id or 0)}/conversation/messages",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-Id": str(tenant_a_id)},
    )
    assert super_list.status_code == status.HTTP_403_FORBIDDEN

    super_post = client.post(
        f"/api/v1/erp/projects/{int(project_a.id or 0)}/conversation/messages",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-Id": str(tenant_a_id)},
        json={"message": "No permitido"},
    )
    assert super_post.status_code == status.HTTP_403_FORBIDDEN

    missing = client.get(
        "/api/v1/erp/projects/999999/conversation/messages",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-Id": str(tenant_a_id)},
    )
    assert missing.status_code == status.HTTP_404_NOT_FOUND

    out_of_tenant = client.get(
        f"/api/v1/erp/projects/{int(project_b.id or 0)}/conversation/messages",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-Id": str(tenant_a_id)},
    )
    assert out_of_tenant.status_code == status.HTTP_404_NOT_FOUND
