from datetime import datetime
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.role import Role
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
    creator_group_id: int | None = None,
    role_name: str = "tenant_admin",
) -> User:
    role = session.exec(select(Role).where(Role.name == role_name)).first()
    assert role is not None
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password("temporal"),
        is_active=True,
        tenant_id=tenant_id,
        role_id=int(role.id or 0),
        creator_group_id=creator_group_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_messages_api_flow(client: TestClient, db_session_fixture: Session) -> None:
    tenant = Tenant(
        name="Tenant Messages",
        subdomain=f"messages-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    sender = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email=f"sender-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Sender User",
        creator_group_id=777,
    )
    receiver = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email=f"receiver-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Receiver User",
        creator_group_id=777,
    )

    sender_headers = _auth_headers_for_user(sender, int(tenant.id or 0))
    receiver_headers = _auth_headers_for_user(receiver, int(tenant.id or 0))

    send_response = client.post(
        "/api/v1/messages",
        headers=sender_headers,
        json={
            "to_user_id": str(receiver.id),
            "message": "Hola equipo",
            "work_report_id": "wr-123",
        },
    )
    assert send_response.status_code == status.HTTP_201_CREATED
    payload = send_response.json()
    assert payload["from_user_id"] == str(sender.id)
    assert payload["to_user_id"] == str(receiver.id)
    assert payload["read"] is False
    message_id = int(payload["id"])

    list_response = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert list_response.status_code == status.HTTP_200_OK
    listed_items = list_response.json()["items"]
    listed_message = next(item for item in listed_items if int(item["id"]) == message_id)
    assert listed_message["read"] is False
    assert listed_message["from_user"]["full_name"] == sender.full_name

    mark_response = client.post(
        f"/api/v1/messages/{message_id}/read",
        headers=receiver_headers,
    )
    assert mark_response.status_code == status.HTTP_200_OK
    assert mark_response.json()["read"] is True

    invalid_mark_response = client.post(
        f"/api/v1/messages/{message_id}/read",
        headers=sender_headers,
    )
    assert invalid_mark_response.status_code == status.HTTP_400_BAD_REQUEST

    delete_conversation_response = client.delete(
        f"/api/v1/messages/conversation/{sender.id}",
        headers=receiver_headers,
    )
    assert delete_conversation_response.status_code == status.HTTP_204_NO_CONTENT

    after_delete = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert after_delete.status_code == status.HTTP_200_OK
    assert all(int(item["id"]) != message_id for item in after_delete.json()["items"])

    second_send = client.post(
        "/api/v1/messages",
        headers=sender_headers,
        json={"to_user_id": str(receiver.id), "message": "Segundo mensaje"},
    )
    assert second_send.status_code == status.HTTP_201_CREATED
    second_message_id = int(second_send.json()["id"])

    delete_single_response = client.delete(
        f"/api/v1/messages/{second_message_id}",
        headers=receiver_headers,
    )
    assert delete_single_response.status_code == status.HTTP_204_NO_CONTENT

    post_single_delete_list = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert post_single_delete_list.status_code == status.HTTP_200_OK
    assert all(int(item["id"]) != second_message_id for item in post_single_delete_list.json()["items"])

    third_send = client.post(
        "/api/v1/messages",
        headers=sender_headers,
        json={"to_user_id": str(receiver.id), "message": "Tercer mensaje"},
    )
    assert third_send.status_code == status.HTTP_201_CREATED

    clear_response = client.delete("/api/v1/messages/clear-all", headers=receiver_headers)
    assert clear_response.status_code == status.HTTP_204_NO_CONTENT

    final_list = client.get("/api/v1/messages?limit=100", headers=receiver_headers)
    assert final_list.status_code == status.HTTP_200_OK
    assert final_list.json()["items"] == []


def test_messages_api_paginates_in_database(client: TestClient, db_session_fixture: Session) -> None:
    tenant = Tenant(
        name="Tenant Messages Pagination",
        subdomain=f"messages-pagination-{int(utc_now().timestamp())}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    sender = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email=f"sender-pagination-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Sender Pagination",
        creator_group_id=888,
    )
    receiver = _create_user(
        db_session_fixture,
        tenant_id=int(tenant.id or 0),
        email=f"receiver-pagination-{int(utc_now().timestamp() * 1000)}@example.com",
        full_name="Receiver Pagination",
        creator_group_id=888,
    )

    sender_headers = _auth_headers_for_user(sender, int(tenant.id or 0))
    receiver_headers = _auth_headers_for_user(receiver, int(tenant.id or 0))

    for index in range(12):
        response = client.post(
            "/api/v1/messages",
            headers=sender_headers,
            json={
                "to_user_id": str(receiver.id),
                "message": f"Mensaje {index}",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

    first_page = client.get("/api/v1/messages?limit=5&offset=0", headers=receiver_headers)
    assert first_page.status_code == status.HTTP_200_OK
    first_payload = first_page.json()
    assert first_payload["total"] == 12
    assert len(first_payload["items"]) == 5

    second_page = client.get("/api/v1/messages?limit=5&offset=5", headers=receiver_headers)
    assert second_page.status_code == status.HTTP_200_OK
    second_payload = second_page.json()
    assert second_payload["total"] == 12
    assert len(second_payload["items"]) == 5

    first_page_ids = {item["id"] for item in first_payload["items"]}
    second_page_ids = {item["id"] for item in second_payload["items"]}
    assert first_page_ids.isdisjoint(second_page_ids)
