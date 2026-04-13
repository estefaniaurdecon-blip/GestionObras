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


def test_work_report_comments_flow(client: TestClient, db_session_fixture: Session) -> None:
    token = _login_superadmin(client)

    tenant = Tenant(
        name="Tenant Comments",
        subdomain=f"comments-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(int(tenant.id or 0)),
    }
    report_id = "wr-legacy-123"

    empty_list_response = client.get(
        f"/api/v1/work-reports/{report_id}/comments",
        headers=headers,
    )
    assert empty_list_response.status_code == status.HTTP_200_OK
    assert empty_list_response.json() == []

    create_response = client.post(
        f"/api/v1/work-reports/{report_id}/comments",
        headers=headers,
        json={"comment": "Comentario de prueba"},
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    created = create_response.json()
    assert created["work_report_id"] == report_id
    assert created["comment"] == "Comentario de prueba"
    assert created["user"]["full_name"] == "Super Admin"

    list_response = client.get(
        f"/api/v1/work-reports/{report_id}/comments",
        headers=headers,
    )
    assert list_response.status_code == status.HTTP_200_OK
    items = list_response.json()
    assert len(items) == 1
    assert items[0]["comment"] == "Comentario de prueba"
