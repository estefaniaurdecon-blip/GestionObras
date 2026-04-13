from datetime import datetime
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.notification import Notification, NotificationType
from app.models.tenant import Tenant
from app.models.user import User


def test_notification_model_uses_enum_values_for_storage() -> None:
    enum_values = list(Notification.__table__.c.type.type.enums)
    assert NotificationType.NEW_MESSAGE.value in enum_values
    assert NotificationType.NEW_MESSAGE.name not in enum_values


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
        subdomain=f"notifications-{int(utc_now().timestamp())}",
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
        type=NotificationType.NEW_MESSAGE,
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


def test_list_notifications_endpoint_only_returns_supported_app_types(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}"}

    tenant = Tenant(
        name="Tenant Notifications Filter",
        subdomain=f"notifications-filter-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god"),
    ).one()

    db_session_fixture.add(
        Notification(
            tenant_id=tenant.id,
            user_id=superadmin.id,
            type=NotificationType.TICKET_ASSIGNED,
            title="Ticket asignado",
            body="No debe mostrarse en este centro",
        )
    )
    db_session_fixture.add(
        Notification(
            tenant_id=tenant.id,
            user_id=superadmin.id,
            type=NotificationType.NEW_MESSAGE,
            title="Nuevo mensaje",
            body="Si debe mostrarse",
        )
    )
    db_session_fixture.commit()

    list_response = client.get("/api/v1/notifications?limit=100", headers=headers)
    assert list_response.status_code == status.HTTP_200_OK

    items = list_response.json()["items"]
    returned_types = {item["type"] for item in items}
    assert "new_message" in returned_types
    assert "ticket_assigned" not in returned_types
