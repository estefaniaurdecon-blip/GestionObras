from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant(client: TestClient, token: str, *, prefix: str) -> int:
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/tenants/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": f"{prefix}-{suffix}",
            "subdomain": f"{prefix.lower()}-{suffix}",
            "is_active": True,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()["id"]


def _create_department(client: TestClient, token: str, *, tenant_id: int, name: str) -> int:
    response = client.post(
        f"/api/v1/hr/departments?tenant_id={tenant_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": name,
            "description": f"Departamento {name}",
            "manager_id": None,
            "is_active": True,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()["id"]


def test_project_create_and_update_support_department_id(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(client, token, prefix="erp-project-dept")
    department_id = _create_department(
        client,
        token,
        tenant_id=tenant_id,
        name="Operaciones",
    )

    created = client.post(
        "/api/v1/erp/projects",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_id),
        },
        json={
            "name": "Proyecto con departamento",
            "department_id": department_id,
            "is_active": True,
        },
    )
    assert created.status_code == status.HTTP_201_CREATED, created.text
    project = created.json()
    assert project["department_id"] == department_id

    updated = client.patch(
        f"/api/v1/erp/projects/{project['id']}",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_id),
        },
        json={"department_id": None},
    )
    assert updated.status_code == status.HTTP_200_OK, updated.text
    assert updated.json()["department_id"] is None


def test_project_create_rejects_department_from_other_tenant(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_a = _create_tenant(client, token, prefix="erp-project-a")
    tenant_b = _create_tenant(client, token, prefix="erp-project-b")
    foreign_department_id = _create_department(
        client,
        token,
        tenant_id=tenant_b,
        name="Finanzas B",
    )

    response = client.post(
        "/api/v1/erp/projects",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_a),
        },
        json={
            "name": "Proyecto invalido",
            "department_id": foreign_department_id,
            "is_active": True,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    assert "no pertenece al tenant" in response.json()["detail"].lower()
