from datetime import timedelta

from fastapi import status
from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session, select

from app.core.security import JWTError, create_access_token, decode_token, hash_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.tenant import Tenant
from app.models.user import User


def test_superadmin_login_without_mfa(client: TestClient) -> None:
    """
    Comprueba que el Super Admin creado por el seed puede hacer login
    sin MFA y recibe un JWT válido.
    """

    data = {
        "username": "dios@cortecelestial.god",
        "password": "temporal",
    }
    response = client.post("/api/v1/auth/login", data=data)

    assert response.status_code == status.HTTP_200_OK

    body = response.json()
    assert body["mfa_required"] is False
    assert "access_token" in body and body["access_token"]
    assert body["token_type"] == "bearer"


def _create_mfa_user(session: Session) -> User:
    """
    Crea un usuario normal para probar el flujo de MFA basado en código enviado por email.
    """

    tenant = Tenant(name="Tenant Test MFA", subdomain="mfa-test")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    user = User(
        email="usuario.mfa@example.com",
        full_name="Usuario MFA",
        hashed_password=hash_password("password-mfa"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return user


def test_mfa_login_flow(client: TestClient, db_session_fixture: Session) -> None:
    """
    Flujo completo de login con MFA por email:
    1) Login con email/contraseña → mfa_required=True y sin token.
    2) Verificar código correcto → JWT emitido.
    """

    # Preparamos un usuario con MFA habilitado.
    user = _create_mfa_user(db_session_fixture)

    # Paso 1: login con credenciales.
    data = {
        "username": user.email,
        "password": "password-mfa",
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK

    body = response.json()
    assert body["mfa_required"] is True
    assert body.get("access_token") is None

    # Paso 2: enviamos un código MFA correcto.
    # En producción el código llega por email; en tests lo fijamos manualmente.
    mfa_record = db_session_fixture.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()
    code = "123456"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db_session_fixture.add(mfa_record)
    db_session_fixture.commit()

    response_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": user.email, "mfa_code": code},
    )
    body_mfa = response_mfa.json()

    assert response_mfa.status_code == status.HTTP_200_OK
    assert body_mfa["mfa_required"] is False
    assert "access_token" in body_mfa and body_mfa["access_token"]
    assert body_mfa["token_type"] == "bearer"


def test_decode_token_rejects_expired_jwt() -> None:
    token = create_access_token(
        subject="123",
        expires_delta=timedelta(seconds=-1),
    )

    with pytest.raises(JWTError):
        decode_token(token)
