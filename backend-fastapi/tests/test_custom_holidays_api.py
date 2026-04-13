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


def test_custom_holidays_crud_flow(client: TestClient, db_session_fixture: Session) -> None:
    token = _login_superadmin(client)

    tenant = Tenant(
        name="Tenant Holidays",
        subdomain=f"holidays-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(int(tenant.id or 0)),
    }

    empty_list_response = client.get("/api/v1/erp/custom-holidays", headers=headers)
    assert empty_list_response.status_code == status.HTTP_200_OK
    assert empty_list_response.json() == []

    create_response = client.post(
        "/api/v1/erp/custom-holidays",
        headers=headers,
        json={
            "date": "2026-12-24",
            "name": "Nochebuena Local",
            "region": "Madrid",
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    created = create_response.json()
    assert created["tenant_id"] == int(tenant.id or 0)
    assert created["date"] == "2026-12-24"
    assert created["name"] == "Nochebuena Local"
    assert created["region"] == "Madrid"
    holiday_id = int(created["id"])

    filtered_list_response = client.get(
        "/api/v1/erp/custom-holidays?region=Madrid",
        headers=headers,
    )
    assert filtered_list_response.status_code == status.HTTP_200_OK
    filtered_payload = filtered_list_response.json()
    assert len(filtered_payload) == 1
    assert int(filtered_payload[0]["id"]) == holiday_id

    update_response = client.patch(
        f"/api/v1/erp/custom-holidays/{holiday_id}",
        headers=headers,
        json={
            "name": "Nochebuena Regional",
            "region": "Nacional",
        },
    )
    assert update_response.status_code == status.HTTP_200_OK
    updated = update_response.json()
    assert updated["name"] == "Nochebuena Regional"
    assert updated["region"] == "Nacional"

    delete_response = client.delete(
        f"/api/v1/erp/custom-holidays/{holiday_id}",
        headers=headers,
    )
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    final_list_response = client.get("/api/v1/erp/custom-holidays", headers=headers)
    assert final_list_response.status_code == status.HTTP_200_OK
    assert final_list_response.json() == []
