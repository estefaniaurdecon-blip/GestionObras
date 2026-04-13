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


def test_company_portfolio_and_types_flow(client: TestClient, db_session_fixture: Session) -> None:
    token = _login_superadmin(client)

    tenant = Tenant(
        name="Tenant Portfolio",
        subdomain=f"portfolio-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(int(tenant.id or 0)),
    }

    list_types_empty = client.get("/api/v1/erp/company-types", headers=headers)
    assert list_types_empty.status_code == status.HTTP_200_OK
    assert list_types_empty.json() == []

    create_type = client.post(
        "/api/v1/erp/company-types",
        headers=headers,
        json={"type_name": "Proveedor"},
    )
    assert create_type.status_code == status.HTTP_201_CREATED
    assert create_type.json()["type_name"] == "Proveedor"

    rename_type = client.patch(
        "/api/v1/erp/company-types/Proveedor",
        headers=headers,
        json={"new_type_name": "Subcontrata"},
    )
    assert rename_type.status_code == status.HTTP_200_OK
    assert rename_type.json()["type_name"] == "Subcontrata"

    list_companies_empty = client.get("/api/v1/erp/company-portfolio", headers=headers)
    assert list_companies_empty.status_code == status.HTTP_200_OK
    assert list_companies_empty.json() == []

    create_company = client.post(
        "/api/v1/erp/company-portfolio",
        headers=headers,
        json={
            "company_name": "Acme Obras",
            "company_type": ["Subcontrata"],
            "contact_person": "Juan Perez",
            "contact_phone": "600000000",
            "contact_email": "juan@acme.es",
            "city": "Murcia",
            "country": "Espana",
        },
    )
    assert create_company.status_code == status.HTTP_201_CREATED
    company = create_company.json()
    company_id = int(company["id"])
    assert company["company_name"] == "Acme Obras"
    assert company["company_type"] == ["Subcontrata"]
    assert company["creator_name"] == "Super Admin"

    delete_type_in_use = client.delete("/api/v1/erp/company-types/Subcontrata", headers=headers)
    assert delete_type_in_use.status_code == status.HTTP_409_CONFLICT
    assert delete_type_in_use.json()["detail"] == "TYPE_IN_USE"

    update_company = client.patch(
        f"/api/v1/erp/company-portfolio/{company_id}",
        headers=headers,
        json={
            "company_type": [],
            "notes": "Sin tipo asignado",
        },
    )
    assert update_company.status_code == status.HTTP_200_OK
    assert update_company.json()["company_type"] == []

    delete_type = client.delete("/api/v1/erp/company-types/Subcontrata", headers=headers)
    assert delete_type.status_code == status.HTTP_204_NO_CONTENT

    delete_company = client.delete(f"/api/v1/erp/company-portfolio/{company_id}", headers=headers)
    assert delete_company.status_code == status.HTTP_204_NO_CONTENT

    final_companies = client.get("/api/v1/erp/company-portfolio", headers=headers)
    assert final_companies.status_code == status.HTTP_200_OK
    assert final_companies.json() == []

