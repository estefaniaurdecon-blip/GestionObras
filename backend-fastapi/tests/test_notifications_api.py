from datetime import datetime

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.notification import Notification, NotificationType
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


def test_delete_notification_endpoint(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}"}

    tenant = Tenant(
        name="Tenant Notifications",
        subdomain=f"notifications-{int(datetime.utcnow().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god"),
    ).one()

    notification = Notification(
        tenant_id=tenant.id,
        user_id=superadmin.id,
        type=NotificationType.GENERIC,
        title="Test notification",
        body="Body",
        reference="work_report_id=123",
    )
    db_session_fixture.add(notification)
    db_session_fixture.commit()
    db_session_fixture.refresh(notification)
    notification_id = notification.id

    list_response = client.get("/api/v1/notifications?limit=100", headers=headers)
    assert list_response.status_code == status.HTTP_200_OK
    listed_ids = [item["id"] for item in list_response.json()["items"]]
    assert notification_id in listed_ids

    delete_response = client.delete(
        f"/api/v1/notifications/{notification_id}",
        headers=headers,
    )
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    db_session_fixture.expire_all()
    deleted = db_session_fixture.get(Notification, notification_id)
    assert deleted is None

    not_found_response = client.delete(
        f"/api/v1/notifications/{notification_id}",
        headers=headers,
    )
    assert not_found_response.status_code == status.HTTP_404_NOT_FOUND
