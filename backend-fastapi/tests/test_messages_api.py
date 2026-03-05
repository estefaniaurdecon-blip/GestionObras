from datetime import datetime

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
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


def _auth_headers_for_user(user: User, tenant_id: int, token: str | None = None) -> dict[str, str]:
    access_token = token or create_access_token(subject=str(user.id))
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Tenant-Id": str(tenant_id),
    }


def _create_user(
    session: Session,
    *,
    tenant_id: int,
    email: str,
    full_name: str,
) -> User:
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=True,
        tenant_id=tenant_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_messages_api_flow(client: TestClient, db_session_fixture: Session) -> None:
    superadmin_token = _login_superadmin(client)
    superadmin = db_session_fixture.exec(
        select(User).where(User.email == "dios@cortecelestial.god")
    ).one()

    tenant = Tenant(
        name="Tenant Messages",
        subdomain=f"messages-{int(datetime.utcnow().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    receiver = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email=f"receiver-{int(datetime.utcnow().timestamp() * 1000)}@example.com",
        full_name="Receiver User",
    )

    superadmin_headers = _auth_headers_for_user(
        superadmin,
        int(tenant.id or 0),
        superadmin_token,
    )
    receiver_headers = _auth_headers_for_user(receiver, int(tenant.id or 0))

    send_response = client.post(
        "/api/v1/messages",
        headers=superadmin_headers,
        json={
            "to_user_id": str(receiver.id),
            "message": "Hola equipo",
            "work_report_id": "wr-123",
        },
    )
    assert send_response.status_code == status.HTTP_201_CREATED
    payload = send_response.json()
    assert payload["from_user_id"] == str(superadmin.id)
    assert payload["to_user_id"] == str(receiver.id)
    assert payload["read"] is False
    message_id = int(payload["id"])

    list_response = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert list_response.status_code == status.HTTP_200_OK
    listed_items = list_response.json()["items"]
    listed_message = next(item for item in listed_items if int(item["id"]) == message_id)
    assert listed_message["read"] is False
    assert listed_message["from_user"]["full_name"] == superadmin.full_name

    mark_response = client.post(
        f"/api/v1/messages/{message_id}/read",
        headers=receiver_headers,
    )
    assert mark_response.status_code == status.HTTP_200_OK
    assert mark_response.json()["read"] is True

    invalid_mark_response = client.post(
        f"/api/v1/messages/{message_id}/read",
        headers=superadmin_headers,
    )
    assert invalid_mark_response.status_code == status.HTTP_400_BAD_REQUEST

    delete_conversation_response = client.delete(
        f"/api/v1/messages/conversation/{superadmin.id}",
        headers=receiver_headers,
    )
    assert delete_conversation_response.status_code == status.HTTP_204_NO_CONTENT

    after_delete = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert after_delete.status_code == status.HTTP_200_OK
    assert all(int(item["id"]) != message_id for item in after_delete.json()["items"])

    second_send = client.post(
        "/api/v1/messages",
        headers=superadmin_headers,
        json={"to_user_id": str(receiver.id), "message": "Segundo mensaje"},
    )
    assert second_send.status_code == status.HTTP_201_CREATED

    clear_response = client.delete("/api/v1/messages/clear-all", headers=receiver_headers)
    assert clear_response.status_code == status.HTTP_204_NO_CONTENT

    final_list = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert final_list.status_code == status.HTTP_200_OK
    assert final_list.json()["items"] == []
