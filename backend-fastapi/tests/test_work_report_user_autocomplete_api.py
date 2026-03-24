from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _auth_headers_for_user(user: User, tenant_id: int, token: str | None = None) -> dict[str, str]:
    access_token = token or create_access_token(subject=str(user.id))
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Tenant-Id": str(tenant_id),
    }


def _create_tenant(session: Session, *, name: str, subdomain: str) -> Tenant:
    tenant = Tenant(name=name, subdomain=subdomain, is_active=True)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def _create_project(client: TestClient, token: str, tenant_id: int, *, name: str) -> int:
    response = client.post(
        "/api/v1/erp/projects",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_id),
        },
        json={"name": name, "is_active": True},
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()["id"]


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
        created_at=datetime.utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_work_report_user_autocomplete_lists_normal_tenant_users(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(
        db_session_fixture,
        name="Tenant Autocomplete WR",
        subdomain=f"wr-autocomplete-{uuid4().hex[:8]}",
    )
    tenant_id = int(tenant.id or 0)
    actor = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"actor-{uuid4().hex[:8]}@example.com",
        full_name="Actor Partes",
        creator_group_id=100,
    )
    matching_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"encargado-{uuid4().hex[:8]}@example.com",
        full_name="Encargado Principal Uno",
        creator_group_id=200,
        role_name="usuario",
    )
    _create_user(
        db_session_fixture,
        tenant_id=tenant_id,
        email=f"super-{uuid4().hex[:8]}@example.com",
        full_name="Super Admin Tenant",
        creator_group_id=None,
        is_super_admin=True,
    )

    response = client.get(
        f"/api/v1/users/contacts/autocomplete/by-tenant/{tenant_id}",
        headers=_auth_headers_for_user(actor, tenant_id),
        params={"q": "encargado"},
    )
    assert response.status_code == status.HTTP_200_OK, response.text

    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == int(matching_user.id or 0)
    assert body[0]["full_name"] == "Encargado Principal Uno"
    assert body[0]["email"] == matching_user.email


def test_work_report_main_foreman_and_site_manager_user_links_validate_and_legacy_text_still_works(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)

    tenant_a = _create_tenant(
        db_session_fixture,
        name="Tenant Parte A",
        subdomain=f"wr-user-a-{uuid4().hex[:8]}",
    )
    tenant_b = _create_tenant(
        db_session_fixture,
        name="Tenant Parte B",
        subdomain=f"wr-user-b-{uuid4().hex[:8]}",
    )
    tenant_a_id = int(tenant_a.id or 0)
    tenant_b_id = int(tenant_b.id or 0)
    project_id = _create_project(client, token, tenant_a_id, name="Proyecto Parte Usuario")

    valid_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_a_id,
        email=f"valido-{uuid4().hex[:8]}@example.com",
        full_name="Encargado Valido",
        creator_group_id=100,
        role_name="usuario",
    )
    valid_site_manager = _create_user(
        db_session_fixture,
        tenant_id=tenant_a_id,
        email=f"site-manager-{uuid4().hex[:8]}@example.com",
        full_name="Jefe de Obra Valido",
        creator_group_id=300,
        role_name="usuario",
    )
    other_tenant_user = _create_user(
        db_session_fixture,
        tenant_id=tenant_b_id,
        email=f"other-{uuid4().hex[:8]}@example.com",
        full_name="Encargado Otro Tenant",
        creator_group_id=200,
        role_name="usuario",
    )
    forbidden_super_admin = _create_user(
        db_session_fixture,
        tenant_id=tenant_a_id,
        email=f"forbidden-super-{uuid4().hex[:8]}@example.com",
        full_name="Super Admin Prohibido",
        creator_group_id=None,
        role_name="tenant_admin",
        is_super_admin=True,
    )

    create_response = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a_id)},
        json={
            "project_id": project_id,
            "date": "2026-03-24",
            "title": "Parte con encargado vinculado",
            "status": "draft",
            "payload": {
                "mainForeman": "Encargado Valido",
                "mainForemanUserId": int(valid_user.id or 0),
                "siteManager": "Jefe de Obra Valido",
                "siteManagerUserId": int(valid_site_manager.id or 0),
            },
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED, create_response.text
    created = create_response.json()
    assert created["payload"]["mainForeman"] == "Encargado Valido"
    assert created["payload"]["mainForemanUserId"] == int(valid_user.id or 0)
    assert created["payload"]["siteManager"] == "Jefe de Obra Valido"
    assert created["payload"]["siteManagerUserId"] == int(valid_site_manager.id or 0)

    report_id = int(created["id"])
    update_legacy_response = client.patch(
        f"/api/v1/erp/work-reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a_id)},
        json={
            "payload": {
                "mainForeman": "Texto libre manual",
                "siteManager": "Jefe libre manual",
            }
        },
    )
    assert update_legacy_response.status_code == status.HTTP_200_OK, update_legacy_response.text
    updated = update_legacy_response.json()
    assert updated["payload"]["mainForeman"] == "Texto libre manual"
    assert "mainForemanUserId" not in updated["payload"]
    assert updated["payload"]["siteManager"] == "Jefe libre manual"
    assert "siteManagerUserId" not in updated["payload"]

    other_tenant_response = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a_id)},
        json={
            "project_id": project_id,
            "date": "2026-03-25",
            "title": "Parte invalido tenant",
            "status": "draft",
            "payload": {
                "mainForeman": "Encargado Otro Tenant",
                "mainForemanUserId": int(other_tenant_user.id or 0),
            },
        },
    )
    assert other_tenant_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "no pertenece al tenant" in other_tenant_response.json()["detail"]

    other_tenant_site_manager_response = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a_id)},
        json={
            "project_id": project_id,
            "date": "2026-03-25",
            "title": "Parte invalido jefe tenant",
            "status": "draft",
            "payload": {
                "siteManager": "Encargado Otro Tenant",
                "siteManagerUserId": int(other_tenant_user.id or 0),
            },
        },
    )
    assert other_tenant_site_manager_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "no pertenece al tenant" in other_tenant_site_manager_response.json()["detail"]

    super_admin_response = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a_id)},
        json={
            "project_id": project_id,
            "date": "2026-03-26",
            "title": "Parte invalido superadmin",
            "status": "draft",
            "payload": {
                "mainForeman": "Super Admin Prohibido",
                "mainForemanUserId": int(forbidden_super_admin.id or 0),
            },
        },
    )
    assert super_admin_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "super_admin" in super_admin_response.json()["detail"]

    super_admin_site_manager_response = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a_id)},
        json={
            "project_id": project_id,
            "date": "2026-03-27",
            "title": "Parte invalido superadmin jefe",
            "status": "draft",
            "payload": {
                "siteManager": "Super Admin Prohibido",
                "siteManagerUserId": int(forbidden_super_admin.id or 0),
            },
        },
    )
    assert super_admin_site_manager_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "super_admin" in super_admin_site_manager_response.json()["detail"]
