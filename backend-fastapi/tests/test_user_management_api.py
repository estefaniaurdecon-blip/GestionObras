from datetime import datetime
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.erp import Project
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User


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


def test_user_management_roles_assignments_and_delete(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)

    tenant = Tenant(
        name="Tenant Users",
        subdomain=f"users-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user_role = db_session_fixture.exec(select(Role).where(Role.name == "user")).first()
    assert user_role is not None

    first_user = User(
        email="foreman.test@example.com",
        full_name="Foreman Test",
        hashed_password=hash_password("temporal123"),
        tenant_id=int(tenant.id or 0),
        role_id=int(user_role.id or 0),
        is_active=False,
    )
    second_user = User(
        email="reader.test@example.com",
        full_name="Reader Test",
        hashed_password=hash_password("temporal123"),
        tenant_id=int(tenant.id or 0),
        role_id=int(user_role.id or 0),
        is_active=True,
    )
    db_session_fixture.add(first_user)
    db_session_fixture.add(second_user)
    db_session_fixture.commit()
    db_session_fixture.refresh(first_user)
    db_session_fixture.refresh(second_user)

    project = Project(
        tenant_id=int(tenant.id or 0),
        name="Obra asignable test",
    )
    db_session_fixture.add(project)
    db_session_fixture.commit()
    db_session_fixture.refresh(project)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(int(tenant.id or 0)),
    }

    list_users_response = client.get("/api/v1/erp/user-management/users", headers=headers)
    assert list_users_response.status_code == status.HTTP_200_OK
    users_payload = list_users_response.json()
    assert len(users_payload) == 2

    approve_response = client.post(
        f"/api/v1/erp/user-management/users/{int(first_user.id or 0)}/approve",
        headers=headers,
        json={"role": "foreman"},
    )
    assert approve_response.status_code == status.HTTP_200_OK
    assert approve_response.json()["approved"] is True

    roles_response = client.get(
        f"/api/v1/erp/user-management/users/{int(first_user.id or 0)}/roles",
        headers=headers,
    )
    assert roles_response.status_code == status.HTTP_200_OK
    assert "foreman" in roles_response.json()["roles"]

    add_role_response = client.post(
        f"/api/v1/erp/user-management/users/{int(first_user.id or 0)}/roles",
        headers=headers,
        json={"role": "reader"},
    )
    assert add_role_response.status_code == status.HTTP_200_OK
    assert "reader" in add_role_response.json()["roles"]

    delete_role_response = client.delete(
        f"/api/v1/erp/user-management/users/{int(first_user.id or 0)}/roles/reader",
        headers=headers,
    )
    assert delete_role_response.status_code == status.HTTP_200_OK
    assert "reader" not in delete_role_response.json()["roles"]

    empty_assignments = client.get(
        f"/api/v1/erp/user-management/users/{int(first_user.id or 0)}/assignments",
        headers=headers,
    )
    assert empty_assignments.status_code == status.HTTP_200_OK
    assert empty_assignments.json()["work_ids"] == []

    assign_response = client.post(
        "/api/v1/erp/user-management/assignments",
        headers=headers,
        json={
            "user_id": int(first_user.id or 0),
            "work_id": int(project.id or 0),
        },
    )
    assert assign_response.status_code == status.HTTP_200_OK
    assert int(project.id or 0) in assign_response.json()["work_ids"]

    remove_assign_response = client.delete(
        (
            "/api/v1/erp/user-management/assignments"
            f"?user_id={int(first_user.id or 0)}&work_id={int(project.id or 0)}"
        ),
        headers=headers,
    )
    assert remove_assign_response.status_code == status.HTTP_200_OK
    assert remove_assign_response.json()["work_ids"] == []

    foremen_response = client.get(
        f"/api/v1/erp/user-management/assignable-foremen?organization_id={int(tenant.id or 0)}",
        headers=headers,
    )
    assert foremen_response.status_code == status.HTTP_200_OK
    foremen_ids = {int(item["id"]) for item in foremen_response.json()}
    assert int(first_user.id or 0) in foremen_ids

    delete_user_response = client.delete(
        f"/api/v1/erp/user-management/users/{int(first_user.id or 0)}",
        headers=headers,
    )
    assert delete_user_response.status_code == status.HTTP_204_NO_CONTENT

    list_after_delete = client.get("/api/v1/erp/user-management/users", headers=headers)
    assert list_after_delete.status_code == status.HTTP_200_OK
    remaining_ids = {int(item["id"]) for item in list_after_delete.json()}
    assert int(first_user.id or 0) not in remaining_ids

