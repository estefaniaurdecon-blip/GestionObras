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


def test_work_report_tenant_isolation_and_listing(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_a = _create_tenant(client, token, prefix="erp-wr-a")
    tenant_b = _create_tenant(client, token, prefix="erp-wr-b")
    project_a = _create_project(client, token, tenant_a, name="Proyecto A")
    _create_project(client, token, tenant_b, name="Proyecto B")

    create_response = client.post(
        "/api/v1/erp/work-reports",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_a),
            "Idempotency-Key": f"wr-{uuid4().hex}",
        },
        json={
            "project_id": project_a,
            "date": "2026-02-12",
            "title": "Parte tenant A",
            "status": "draft",
            "payload": {"foo": "bar"},
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED, create_response.text
    created = create_response.json()

    list_a = client.get(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
    )
    assert list_a.status_code == status.HTTP_200_OK
    assert len(list_a.json()) == 1

    list_b = client.get(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_b)},
    )
    assert list_b.status_code == status.HTTP_200_OK
    assert list_b.json() == []

    get_forbidden = client.get(
        f"/api/v1/erp/work-reports/{created['id']}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_b)},
    )
    assert get_forbidden.status_code == status.HTTP_404_NOT_FOUND


def test_work_report_closed_blocks_update_and_delete(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(client, token, prefix="erp-wr-close")
    project_id = _create_project(client, token, tenant_id, name="Proyecto Cierre")

    create_response = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "date": "2026-02-12",
            "title": "Parte editable",
            "status": "draft",
            "payload": {},
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    report_id = create_response.json()["id"]

    close_response = client.patch(
        f"/api/v1/erp/work-reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={"status": "closed"},
    )
    assert close_response.status_code == status.HTTP_200_OK
    assert close_response.json()["is_closed"] is True

    blocked_update = client.patch(
        f"/api/v1/erp/work-reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={"title": "No permitido"},
    )
    assert blocked_update.status_code == status.HTTP_409_CONFLICT

    blocked_delete = client.delete(
        f"/api/v1/erp/work-reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
    )
    assert blocked_delete.status_code == status.HTTP_409_CONFLICT


def test_work_report_sync_is_idempotent_by_client_op_id(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(client, token, prefix="erp-sync")
    project_id = _create_project(client, token, tenant_id, name="Proyecto Sync")

    sync_payload = {
        "operations": [
            {
                "client_op_id": "client-op-001",
                "op": "create",
                "client_temp_id": "tmp-local-001",
                "data": {
                    "project_id": project_id,
                    "date": "2026-02-12",
                    "title": "Parte sincronizado",
                    "status": "draft",
                    "payload": {"source": "offline"},
                },
            }
        ]
    }

    first_sync = client.post(
        "/api/v1/erp/work-reports/sync",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json=sync_payload,
    )
    assert first_sync.status_code == status.HTTP_200_OK, first_sync.text
    first_body = first_sync.json()
    assert first_body["ack"][0]["ok"] is True
    mapped_id = first_body["id_map"]["tmp-local-001"]

    second_sync = client.post(
        "/api/v1/erp/work-reports/sync",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json=sync_payload,
    )
    assert second_sync.status_code == status.HTTP_200_OK, second_sync.text
    second_body = second_sync.json()
    assert second_body["ack"][0]["ok"] is True
    assert second_body["id_map"]["tmp-local-001"] == mapped_id

    reports = client.get(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
    )
    assert reports.status_code == status.HTTP_200_OK
    assert len(reports.json()) == 1

    delete_sync = client.post(
        "/api/v1/erp/work-reports/sync",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "operations": [
                {
                    "client_op_id": "client-op-002",
                    "op": "delete",
                    "report_id": mapped_id,
                    "data": {},
                }
            ]
        },
    )
    assert delete_sync.status_code == status.HTTP_200_OK, delete_sync.text
    assert delete_sync.json()["ack"][0]["ok"] is True

    pull_sync = client.post(
        "/api/v1/erp/work-reports/sync",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={"operations": [], "since": "2000-01-01T00:00:00Z"},
    )
    assert pull_sync.status_code == status.HTTP_200_OK, pull_sync.text
    server_changes = pull_sync.json()["server_changes"]
    assert any(row["id"] == mapped_id and row["deleted_at"] is not None for row in server_changes)


def test_work_report_idempotency_is_namespaced_by_tenant(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_a = _create_tenant(client, token, prefix="erp-idem-a")
    tenant_b = _create_tenant(client, token, prefix="erp-idem-b")
    project_a = _create_project(client, token, tenant_a, name="Proyecto Idem A")
    project_b = _create_project(client, token, tenant_b, name="Proyecto Idem B")
    idem_key = f"idem-{uuid4().hex}"

    create_a_1 = client.post(
        "/api/v1/erp/work-reports",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_a),
            "Idempotency-Key": idem_key,
        },
        json={
            "project_id": project_a,
            "date": "2026-02-12",
            "title": "Parte A",
            "status": "draft",
            "payload": {},
        },
    )
    assert create_a_1.status_code == status.HTTP_201_CREATED, create_a_1.text
    report_a_id = create_a_1.json()["id"]

    create_a_2 = client.post(
        "/api/v1/erp/work-reports",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_a),
            "Idempotency-Key": idem_key,
        },
        json={
            "project_id": project_a,
            "date": "2026-02-12",
            "title": "Parte A repetido",
            "status": "draft",
            "payload": {"different": True},
        },
    )
    assert create_a_2.status_code == status.HTTP_201_CREATED, create_a_2.text
    assert create_a_2.json()["id"] == report_a_id

    create_b = client.post(
        "/api/v1/erp/work-reports",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": str(tenant_b),
            "Idempotency-Key": idem_key,
        },
        json={
            "project_id": project_b,
            "date": "2026-02-12",
            "title": "Parte B",
            "status": "draft",
            "payload": {},
        },
    )
    assert create_b.status_code == status.HTTP_201_CREATED, create_b.text
    report_b_id = create_b.json()["id"]
    assert report_b_id != report_a_id

    list_a = client.get(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
    )
    assert list_a.status_code == status.HTTP_200_OK
    assert len(list_a.json()) == 1

    list_b = client.get(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_b)},
    )
    assert list_b.status_code == status.HTTP_200_OK
    assert len(list_b.json()) == 1


def test_work_report_report_identifier_is_unique_globally(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_a = _create_tenant(client, token, prefix="erp-ident-a")
    tenant_b = _create_tenant(client, token, prefix="erp-ident-b")
    project_a = _create_project(client, token, tenant_a, name="Proyecto Ident A")
    project_b = _create_project(client, token, tenant_b, name="Proyecto Ident B")

    create_a = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
        json={
            "project_id": project_a,
            "date": "2026-02-12",
            "title": "Parte A",
            "status": "draft",
            "report_identifier": "20260212-abcd1234",
            "payload": {},
        },
    )
    assert create_a.status_code == status.HTTP_201_CREATED, create_a.text

    duplicate_same_tenant = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
        json={
            "project_id": project_a,
            "date": "2026-02-13",
            "title": "Parte A duplicado",
            "status": "draft",
            "report_identifier": "20260212-abcd1234",
            "payload": {},
        },
    )
    assert duplicate_same_tenant.status_code == status.HTTP_409_CONFLICT

    same_identifier_other_tenant = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_b)},
        json={
            "project_id": project_b,
            "date": "2026-02-12",
            "title": "Parte B",
            "status": "draft",
            "report_identifier": "20260212-abcd1234",
            "payload": {},
        },
    )
    assert same_identifier_other_tenant.status_code == status.HTTP_409_CONFLICT


def test_work_report_delete_is_permanent_and_releases_identifier(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_a = _create_tenant(client, token, prefix="erp-ident-delete-a")
    tenant_b = _create_tenant(client, token, prefix="erp-ident-delete-b")
    project_a = _create_project(client, token, tenant_a, name="Proyecto Delete A")
    project_b = _create_project(client, token, tenant_b, name="Proyecto Delete B")
    identifier = "20260225-zxyw9876"

    created = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
        json={
            "project_id": project_a,
            "date": "2026-02-25",
            "title": "Parte a eliminar",
            "status": "draft",
            "report_identifier": identifier,
            "payload": {},
        },
    )
    assert created.status_code == status.HTTP_201_CREATED, created.text
    report_id = created.json()["id"]

    deleted = client.delete(
        f"/api/v1/erp/work-reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
    )
    assert deleted.status_code == status.HTTP_204_NO_CONTENT, deleted.text

    should_be_gone = client.get(
        f"/api/v1/erp/work-reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_a)},
    )
    assert should_be_gone.status_code == status.HTTP_404_NOT_FOUND

    recreated_on_other_tenant = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_b)},
        json={
            "project_id": project_b,
            "date": "2026-02-26",
            "title": "Parte recreado",
            "status": "draft",
            "report_identifier": identifier,
            "payload": {},
        },
    )
    assert recreated_on_other_tenant.status_code == status.HTTP_201_CREATED, recreated_on_other_tenant.text


def test_work_report_update_rejects_existing_identifier(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(client, token, prefix="erp-ident-update")
    project_id = _create_project(client, token, tenant_id, name="Proyecto Ident Update")

    create_one = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "date": "2026-02-12",
            "title": "Parte Uno",
            "status": "draft",
            "report_identifier": "20260212-aaaa1111",
            "payload": {},
        },
    )
    assert create_one.status_code == status.HTTP_201_CREATED, create_one.text
    report_one_id = create_one.json()["id"]

    create_two = client.post(
        "/api/v1/erp/work-reports",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "date": "2026-02-13",
            "title": "Parte Dos",
            "status": "draft",
            "report_identifier": "20260213-bbbb2222",
            "payload": {},
        },
    )
    assert create_two.status_code == status.HTTP_201_CREATED, create_two.text
    report_two_id = create_two.json()["id"]

    update_conflict = client.patch(
        f"/api/v1/erp/work-reports/{report_two_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={"report_identifier": "20260212-aaaa1111"},
    )
    assert update_conflict.status_code == status.HTTP_409_CONFLICT

    unchanged = client.get(
        f"/api/v1/erp/work-reports/{report_one_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
    )
    assert unchanged.status_code == status.HTTP_200_OK
    assert unchanged.json()["report_identifier"] == "20260212-aaaa1111"


def test_rental_machinery_active_on_filters_by_interval_and_status(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(client, token, prefix="erp-rental")
    project_id = _create_project(client, token, tenant_id, name="Proyecto Rental")

    active = client.post(
        "/api/v1/erp/rental-machinery",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "name": "Grua activa",
            "start_date": "2026-02-01",
            "end_date": None,
            "status": "active",
            "price": "120.00",
            "price_unit": "day",
        },
    )
    assert active.status_code == status.HTTP_201_CREATED, active.text
    active_id = active.json()["id"]

    inactive = client.post(
        "/api/v1/erp/rental-machinery",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "name": "Grua inactiva",
            "start_date": "2026-02-01",
            "end_date": None,
            "status": "inactive",
            "price_unit": "day",
        },
    )
    assert inactive.status_code == status.HTTP_201_CREATED

    ended = client.post(
        "/api/v1/erp/rental-machinery",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "name": "Mini pala finalizada",
            "start_date": "2026-01-01",
            "end_date": "2026-02-05",
            "status": "active",
            "price_unit": "day",
        },
    )
    assert ended.status_code == status.HTTP_201_CREATED

    response = client.get(
        "/api/v1/erp/rental-machinery",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        params={"project_id": project_id, "active_on": "2026-02-12"},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    machines = response.json()
    assert len(machines) == 1
    assert machines[0]["id"] == active_id


def test_rental_machinery_supports_legacy_machine_fields(client: TestClient) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(client, token, prefix="erp-rental-legacy")
    project_id = _create_project(client, token, tenant_id, name="Proyecto Legacy Rental")

    created = client.post(
        "/api/v1/erp/rental-machinery",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "project_id": project_id,
            "name": "Excavadora",
            "machine_number": "EXC-001",
            "provider": "Proveedor Uno",
            "start_date": "2026-03-01",
            "end_date": None,
            "price": "250.50",
            "price_unit": "day",
            "notes": "Maquina principal de movimiento de tierras",
            "image_url": "data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh",
            "status": "active",
        },
    )
    assert created.status_code == status.HTTP_201_CREATED, created.text
    payload = created.json()
    machinery_id = payload["id"]
    assert payload["machine_number"] == "EXC-001"
    assert payload["notes"] == "Maquina principal de movimiento de tierras"
    assert payload["image_url"].startswith("data:image/jpeg;base64,")

    updated = client.patch(
        f"/api/v1/erp/rental-machinery/{machinery_id}",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "machine_number": "EXC-002",
            "notes": "Actualizada para jornada extendida",
            "image_url": "https://cdn.example.com/machinery/exc-002.jpg",
            "end_date": "2026-03-15",
            "status": "inactive",
        },
    )
    assert updated.status_code == status.HTTP_200_OK, updated.text
    updated_payload = updated.json()
    assert updated_payload["machine_number"] == "EXC-002"
    assert updated_payload["notes"] == "Actualizada para jornada extendida"
    assert updated_payload["image_url"] == "https://cdn.example.com/machinery/exc-002.jpg"
    assert updated_payload["status"] == "inactive"

    listed = client.get(
        "/api/v1/erp/rental-machinery",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        params={"project_id": project_id, "limit": 50},
    )
    assert listed.status_code == status.HTTP_200_OK, listed.text
    listed_items = listed.json()
    assert any(item["id"] == machinery_id and item["machine_number"] == "EXC-002" for item in listed_items)
