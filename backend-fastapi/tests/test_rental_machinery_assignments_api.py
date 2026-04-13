from datetime import datetime
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.tenant import Tenant


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


def test_rental_machinery_assignments_crud_flow(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)

    tenant = Tenant(
        name="Tenant Assignments",
        subdomain=f"assignments-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(int(tenant.id or 0)),
    }

    empty_list_response = client.get("/api/v1/erp/rental-machinery-assignments", headers=headers)
    assert empty_list_response.status_code == status.HTTP_200_OK
    assert empty_list_response.json() == []

    create_payload = {
        "rental_machinery_id": "mach-1",
        "work_id": "101",
        "assignment_date": "2026-03-09",
        "end_date": None,
        "operator_name": "Operador Uno",
        "company_name": "Subcontrata Uno",
        "activity": "Movimiento de tierra",
    }
    create_response = client.post(
        "/api/v1/erp/rental-machinery-assignments",
        headers=headers,
        json=create_payload,
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    created = create_response.json()
    assignment_id = int(created["id"])
    assert created["tenant_id"] == int(tenant.id or 0)
    assert created["rental_machinery_id"] == "mach-1"
    assert created["work_id"] == "101"

    duplicate_response = client.post(
        "/api/v1/erp/rental-machinery-assignments",
        headers=headers,
        json=create_payload,
    )
    assert duplicate_response.status_code == status.HTTP_409_CONFLICT

    filtered_response = client.get(
        "/api/v1/erp/rental-machinery-assignments?rental_machinery_id=mach-1",
        headers=headers,
    )
    assert filtered_response.status_code == status.HTTP_200_OK
    filtered_items = filtered_response.json()
    assert len(filtered_items) == 1
    assert int(filtered_items[0]["id"]) == assignment_id

    update_response = client.patch(
        f"/api/v1/erp/rental-machinery-assignments/{assignment_id}",
        headers=headers,
        json={
            "operator_name": "Operador Dos",
            "company_name": "Subcontrata Dos",
            "activity": "Nivelacion",
        },
    )
    assert update_response.status_code == status.HTTP_200_OK
    updated = update_response.json()
    assert updated["operator_name"] == "Operador Dos"
    assert updated["company_name"] == "Subcontrata Dos"
    assert updated["activity"] == "Nivelacion"

    delete_response = client.delete(
        f"/api/v1/erp/rental-machinery-assignments/{assignment_id}",
        headers=headers,
    )
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    final_list_response = client.get(
        "/api/v1/erp/rental-machinery-assignments",
        headers=headers,
    )
    assert final_list_response.status_code == status.HTTP_200_OK
    assert final_list_response.json() == []
