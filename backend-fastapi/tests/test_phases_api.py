from datetime import date, datetime
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.erp import Project, WorkReport
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


def test_phases_crud_and_children_guard(client: TestClient, db_session_fixture: Session) -> None:
    token = _login_superadmin(client)

    tenant = Tenant(
        name="Tenant Phases",
        subdomain=f"phases-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    project = Project(
        tenant_id=int(tenant.id or 0),
        name="Obra Test Fases",
        description="Proyecto para test de fases",
    )
    db_session_fixture.add(project)
    db_session_fixture.commit()
    db_session_fixture.refresh(project)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(int(tenant.id or 0)),
    }

    empty_list_response = client.get("/api/v1/erp/phases", headers=headers)
    assert empty_list_response.status_code == status.HTTP_200_OK
    assert empty_list_response.json() == []

    create_response = client.post(
        "/api/v1/erp/phases",
        headers=headers,
        json={
            "name": "Cimentacion",
            "project_id": int(project.id or 0),
            "start_date": "2026-03-01",
            "end_date": "2026-03-10",
            "status": "pending",
            "progress": 0,
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    created = create_response.json()
    phase_id = int(created["id"])
    assert created["tenant_id"] == int(tenant.id or 0)
    assert created["project_id"] == int(project.id or 0)
    assert created["work_name"] == "Obra Test Fases"

    list_response = client.get("/api/v1/erp/phases", headers=headers)
    assert list_response.status_code == status.HTTP_200_OK
    listed = list_response.json()
    assert len(listed) == 1
    assert int(listed[0]["id"]) == phase_id
    assert listed[0]["work_name"] == "Obra Test Fases"

    has_children_initial = client.get(f"/api/v1/erp/phases/{phase_id}/has-children", headers=headers)
    assert has_children_initial.status_code == status.HTTP_200_OK
    assert has_children_initial.json()["has_children"] is False

    update_response = client.patch(
        f"/api/v1/erp/phases/{phase_id}",
        headers=headers,
        json={
            "name": "Cimentacion y arranque",
            "status": "in_progress",
            "progress": 35,
        },
    )
    assert update_response.status_code == status.HTTP_200_OK
    updated = update_response.json()
    assert updated["name"] == "Cimentacion y arranque"
    assert updated["status"] == "in_progress"
    assert int(updated["progress"]) == 35

    report = WorkReport(
        tenant_id=int(tenant.id or 0),
        project_id=int(project.id or 0),
        title="Parte de prueba",
        date=date(2026, 3, 5),
        status="draft",
        is_closed=False,
        payload={},
    )
    db_session_fixture.add(report)
    db_session_fixture.commit()

    has_children_after_report = client.get(
        f"/api/v1/erp/phases/{phase_id}/has-children",
        headers=headers,
    )
    assert has_children_after_report.status_code == status.HTTP_200_OK
    assert has_children_after_report.json()["has_children"] is True

    delete_conflict = client.delete(f"/api/v1/erp/phases/{phase_id}", headers=headers)
    assert delete_conflict.status_code == status.HTTP_409_CONFLICT
    assert delete_conflict.json()["detail"] == "PHASE_HAS_CHILDREN"

    move_dates_response = client.patch(
        f"/api/v1/erp/phases/{phase_id}",
        headers=headers,
        json={
            "start_date": "2026-03-20",
            "end_date": "2026-03-25",
        },
    )
    assert move_dates_response.status_code == status.HTTP_200_OK

    delete_response = client.delete(f"/api/v1/erp/phases/{phase_id}", headers=headers)
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    final_list_response = client.get("/api/v1/erp/phases", headers=headers)
    assert final_list_response.status_code == status.HTTP_200_OK
    assert final_list_response.json() == []

