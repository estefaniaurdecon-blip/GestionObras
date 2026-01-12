from datetime import datetime, timedelta

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_invitation import UserInvitation


def _login_superadmin(client: TestClient) -> str:
    data = {"username": "dios@cortecelestial.god", "password": "temporal"}
    resp = client.post("/api/v1/auth/login", data=data)
    assert resp.status_code == status.HTTP_200_OK
    return resp.json()["access_token"]


def test_create_and_accept_invitation_flow(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Flujo completo de invitación:
    - Super admin crea tenant de pruebas.
    - Super admin crea invitación para ese tenant.
    - Se valida el token de invitación (endpoint público).
    - Se acepta la invitación y se crea el usuario.
    - El usuario queda ligado al tenant correcto.
    """

    token_sa = _login_superadmin(client)
    headers_sa = {"Authorization": f"Bearer {token_sa}"}

    tenant_payload = {
        "name": "Tenant Invitaciones",
        "subdomain": "invites",
        "is_active": True,
    }
    resp_tenant = client.post("/api/v1/tenants/", json=tenant_payload, headers=headers_sa)
    assert resp_tenant.status_code == status.HTTP_201_CREATED
    tenant_id = resp_tenant.json()["id"]

    invitation_payload = {
        "email": "invite@example.com",
        "full_name": "Invitado Demo",
        "tenant_id": tenant_id,
        "role_name": "user",
    }
    resp_inv = client.post("/api/v1/invitations", json=invitation_payload, headers=headers_sa)
    assert resp_inv.status_code == status.HTTP_201_CREATED
    inv_data = resp_inv.json()
    assert inv_data["email"] == "invite@example.com"
    assert inv_data["tenant_id"] == tenant_id

    invitation_db = db_session_fixture.exec(
        select(UserInvitation).where(UserInvitation.email == "invite@example.com"),
    ).one()
    token = invitation_db.token

    resp_validate = client.get(f"/api/v1/invitations/validate?token={token}")
    assert resp_validate.status_code == status.HTTP_200_OK
    validate_data = resp_validate.json()
    assert validate_data["is_valid"] is True
    assert validate_data["is_used"] is False
    assert validate_data["is_expired"] is False

    accept_payload = {
        "token": token,
        "full_name": "Invitado Demo",
        "password": "invite-pass",
    }
    resp_accept = client.post("/api/v1/invitations/accept", json=accept_payload)
    assert resp_accept.status_code == status.HTTP_204_NO_CONTENT

    user = db_session_fixture.exec(
        select(User).where(User.email == "invite@example.com"),
    ).one_or_none()
    assert user is not None
    assert user.tenant_id == tenant_id
    assert user.is_super_admin is False

    resp_validate_after = client.get(f"/api/v1/invitations/validate?token={token}")
    assert resp_validate_after.status_code == status.HTTP_200_OK
    validate_after = resp_validate_after.json()
    assert validate_after["is_valid"] is False
    assert validate_after["is_used"] is True


def test_invitation_cannot_be_reused(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Una invitación aceptada no puede volver a usarse.
    """

    token_sa = _login_superadmin(client)
    headers_sa = {"Authorization": f"Bearer {token_sa}"}

    tenant_payload = {
        "name": "Tenant Reuse",
        "subdomain": "reuse",
        "is_active": True,
    }
    resp_tenant = client.post("/api/v1/tenants/", json=tenant_payload, headers=headers_sa)
    assert resp_tenant.status_code == status.HTTP_201_CREATED
    tenant_id = resp_tenant.json()["id"]

    invitation_payload = {
        "email": "reuse@example.com",
        "full_name": "Invitado Reuse",
        "tenant_id": tenant_id,
        "role_name": "user",
    }
    resp_inv = client.post("/api/v1/invitations", json=invitation_payload, headers=headers_sa)
    assert resp_inv.status_code == status.HTTP_201_CREATED

    invitation_db = db_session_fixture.exec(
        select(UserInvitation).where(UserInvitation.email == "reuse@example.com"),
    ).one()
    token = invitation_db.token

    accept_payload = {
        "token": token,
        "full_name": "Invitado Reuse",
        "password": "invite-pass",
    }
    resp_accept_1 = client.post("/api/v1/invitations/accept", json=accept_payload)
    assert resp_accept_1.status_code == status.HTTP_204_NO_CONTENT

    resp_accept_2 = client.post("/api/v1/invitations/accept", json=accept_payload)
    assert resp_accept_2.status_code == status.HTTP_400_BAD_REQUEST
    body = resp_accept_2.json()
    assert "ya ha sido utilizada" in body["detail"]


def test_expired_invitation_is_not_valid(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Una invitación expirada no se puede usar.
    """

    tenant = Tenant(name="Tenant Expired", subdomain="expired", is_active=True)
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    invitation = UserInvitation(
        email="expired@example.com",
        full_name="Invitado Expirado",
        tenant_id=tenant.id,
        role_name="user",
        token="expired-token",
        created_by_id=1,
        expires_at=datetime.utcnow() - timedelta(days=1),
    )
    db_session_fixture.add(invitation)
    db_session_fixture.commit()

    resp_validate = client.get("/api/v1/invitations/validate?token=expired-token")
    assert resp_validate.status_code == status.HTTP_200_OK
    data = resp_validate.json()
    assert data["is_valid"] is False
    assert data["is_expired"] is True

    accept_payload = {
        "token": "expired-token",
        "full_name": "Invitado Expirado",
        "password": "invite-pass",
    }
    resp_accept = client.post("/api/v1/invitations/accept", json=accept_payload)
    assert resp_accept.status_code == status.HTTP_400_BAD_REQUEST
