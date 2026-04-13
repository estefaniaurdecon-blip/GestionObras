from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User


def _auth_headers_for_user(user: User, tenant_id: int, token: str | None = None) -> dict[str, str]:
    access_token = token or create_access_token(subject=str(user.id))
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Tenant-Id": str(tenant_id),
    }


def _create_tenant(session: Session, *, name: str, subdomain: str) -> Tenant:
    tenant = Tenant(
        name=name,
        subdomain=subdomain,
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
    email: str,
    full_name: str,
    creator_group_id: int | None,
    role_name: str = "tenant_admin",
    is_super_admin: bool = False,
) -> User:
    role = session.exec(select(Role).where(Role.name == role_name)).first()
    assert role is not None
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=True,
        is_super_admin=is_super_admin,
        tenant_id=tenant_id,
        role_id=int(role.id or 0),
        creator_group_id=creator_group_id,
        created_at=utc_now(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_general_conversation_directory_lists_all_normal_tenant_users_and_allows_cross_group_dm_within_tenant(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(
        db_session_fixture,
        name="Tenant Contactos",
        subdomain=f"contacts-{int(utc_now().timestamp())}",
    )
    tenant_id = int(tenant.id or 0)

    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"actor-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Actor Contactos",
        creator_group_id=100,
        role_name="tenant_admin",
    )
    same_group_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"same-group-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Same Group User",
        creator_group_id=100,
        role_name="usuario",
    )
    other_group_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"other-group-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Other Group User",
        creator_group_id=200,
        role_name="usuario",
    )
    _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"super-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Tenant Super Admin",
        creator_group_id=None,
        role_name="tenant_admin",
        is_super_admin=True,
    )

    actor_headers = _auth_headers_for_user(actor, tenant_id)

    contacts_response = client.get(
        f"/api/v1/users/contacts/by-tenant/{tenant_id}",
        headers=actor_headers,
    )
    assert contacts_response.status_code == status.HTTP_200_OK

    contact_items = contacts_response.json()
    contact_ids = {int(item["id"]) for item in contact_items}
    contact_names = {item["full_name"] for item in contact_items}

    assert int(actor.id or 0) not in contact_ids
    assert int(same_group_user.id or 0) in contact_ids
    assert int(other_group_user.id or 0) in contact_ids
    assert "Tenant Super Admin" not in contact_names

    dm_same_group_response = client.post(
        "/api/v1/messages",
        headers=actor_headers,
        json={
            "to_user_id": str(int(same_group_user.id or 0)),
            "message": "Hola mismo grupo",
        },
    )
    assert dm_same_group_response.status_code == status.HTTP_201_CREATED

    dm_other_group_response = client.post(
        "/api/v1/messages",
        headers=actor_headers,
        json={
            "to_user_id": str(int(other_group_user.id or 0)),
            "message": "Hola otro grupo",
        },
    )
    assert dm_other_group_response.status_code == status.HTTP_201_CREATED


def test_general_dm_rejects_cross_tenant_and_self_messages(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(
        db_session_fixture,
        name="Tenant A DM",
        subdomain=f"tenant-a-{int(utc_now().timestamp())}",
    )
    tenant_b = _create_tenant(
        db_session_fixture,
        name="Tenant B DM",
        subdomain=f"tenant-b-{int(utc_now().timestamp())}",
    )
    tenant_a_id = int(tenant_a.id or 0)
    tenant_b_id = int(tenant_b.id or 0)

    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_a_id,
        email=f"actor-self-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Actor Self",
        creator_group_id=100,
        role_name="tenant_admin",
    )
    other_tenant_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_b_id,
        email=f"other-tenant-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Other Tenant User",
        creator_group_id=200,
        role_name="usuario",
    )

    actor_headers = _auth_headers_for_user(actor, tenant_a_id)

    self_response = client.post(
        "/api/v1/messages",
        headers=actor_headers,
        json={
            "to_user_id": str(int(actor.id or 0)),
            "message": "Hola yo",
        },
    )
    assert self_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "ti mismo" in self_response.json()["detail"]

    cross_tenant_response = client.post(
        "/api/v1/messages",
        headers=actor_headers,
        json={
            "to_user_id": str(int(other_tenant_user.id or 0)),
            "message": "Hola otro tenant",
        },
    )
    assert cross_tenant_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "fuera del tenant" in cross_tenant_response.json()["detail"]
