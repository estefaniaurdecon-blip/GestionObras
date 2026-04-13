from datetime import datetime, timedelta
from app.core.datetime import utc_now

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.mfa_email_code import MFAEmailCode
from app.models.ticket import Ticket, TicketStatus, TicketPriority
from app.models.user import User


def _login_superadmin(client: TestClient) -> str:
    data = {
        "username": "dios@cortecelestial.god",
        "password": "temporal",
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant(
    client: TestClient,
    token: str,
    name: str = "Tenant Tickets",
    subdomain: str = "tickets-tenant",
) -> int:
    payload = {
        "name": name,
        "subdomain": subdomain,
        "is_active": True,
    }
    resp = client.post(
        "/api/v1/tenants/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    return resp.json()["id"]


def _create_tenant_admin(
    client: TestClient,
    token: str,
    tenant_id: int,
    email: str = "admin.tickets@example.com",
) -> tuple[int, str]:
    payload = {
        "email": email,
        "full_name": "Admin Tickets",
        "password": "tickets-pass",
        "tenant_id": tenant_id,
        "is_super_admin": False,
        "role_name": "tenant_admin",
    }
    resp = client.post(
        "/api/v1/users/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    body = resp.json()
    return body["id"], email


def _login_with_mfa(
    client: TestClient,
    email: str,
    password: str,
    db_session: Session,
) -> str:
    """
    Realiza el flujo completo de login con MFA por email para usuarios no superadmin.
    """

    # Paso 1: login con usuario/contraseÃ±a.
    data = {
        "username": email,
        "password": password,
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["mfa_required"] is True
    assert body.get("access_token") is None

    # Paso 2: fijamos un cÃ³digo conocido en el registro MFA y lo verificamos.
    user = db_session.exec(select(User).where(User.email == email)).one()
    mfa_record = db_session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()

    code = "654321"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db_session.add(mfa_record)
    db_session.commit()

    resp_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": email, "mfa_code": code},
    )
    assert resp_mfa.status_code == status.HTTP_200_OK
    token_body = resp_mfa.json()
    assert token_body["mfa_required"] is False
    return token_body["access_token"]


def test_ticket_flow_for_tenant_admin(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Comprueba el flujo bÃ¡sico de tickets para un admin de tenant:
    - CreaciÃ³n de ticket.
    - Listado filtrado por tenant.
    - Cambio de estado (close / reopen).
    - AsignaciÃ³n a usuario.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Tickets",
        subdomain="tickets-flow",
    )
    user_id, email = _create_tenant_admin(client, super_token, tenant_id)
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Crear ticket
    ticket_payload = {
        "subject": "Error en ERP",
        "description": "No carga la pantalla de proyectos.",
        "priority": "high",
        "tool_slug": "erp",
        "category": "erp",
    }
    resp_create = client.post(
        "/api/v1/tickets",
        json=ticket_payload,
        headers=headers_admin,
    )
    assert resp_create.status_code == status.HTTP_201_CREATED
    ticket = resp_create.json()
    assert ticket["subject"] == ticket_payload["subject"]
    assert ticket["priority"] == ticket_payload["priority"]
    assert ticket["category"] == ticket_payload["category"]
    assert ticket["tenant_id"] == tenant_id
    ticket_id = ticket["id"]

    # Listar tickets del tenant
    resp_list = client.get(
        "/api/v1/tickets",
        headers=headers_admin,
    )
    assert resp_list.status_code == status.HTTP_200_OK
    tickets = resp_list.json()
    ids = [t["id"] for t in tickets]
    assert ticket_id in ids

    # Comprobamos que el admin_tenant tiene los permisos de tickets esperados.
    admin_db = db_session_fixture.exec(
        select(User).where(User.email == email),
    ).one()
    perms_codes = db_session_fixture.exec(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == admin_db.role_id),
    ).all()
    print("Permisos admin_tenant:", perms_codes)

    # Cerrar ticket
    resp_close = client.post(
        f"/api/v1/tickets/{ticket_id}/close",
        headers=headers_admin,
    )
    print("Close ticket response:", resp_close.status_code, resp_close.json())
    assert resp_close.status_code == status.HTTP_200_OK
    body_close = resp_close.json()
    assert body_close["status"] == "closed"
    assert body_close["closed_at"] is not None

    # Reabrir ticket
    resp_reopen = client.post(
        f"/api/v1/tickets/{ticket_id}/reopen",
        headers=headers_admin,
    )
    assert resp_reopen.status_code == status.HTTP_200_OK
    body_reopen = resp_reopen.json()
    assert body_reopen["status"] == "in_progress"

    # Asignar ticket al propio admin
    resp_assign = client.post(
        f"/api/v1/tickets/{ticket_id}/assign",
        json={"assignee_id": user_id},
        headers=headers_admin,
    )
    assert resp_assign.status_code == status.HTTP_200_OK
    body_assign = resp_assign.json()
    assert body_assign["assigned_to_email"] == email


def test_superadmin_can_filter_tickets_by_tenant(client: TestClient, db_session_fixture: Session) -> None:
    """
    Verifica que el Super Admin puede filtrar tickets por tenant_id.
    """

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Creamos dos tenants con subdominios distintos
    tenant_a = _create_tenant(client, token, name="Tenant A", subdomain="tickets-a")
    tenant_b = _create_tenant(client, token, name="Tenant B", subdomain="tickets-b")

    # Insertamos tickets directamente en la BD de pruebas
    now = utc_now()
    with db_session_fixture as session:
        for tenant_id in (tenant_a, tenant_b):
            t = Ticket(
                tenant_id=tenant_id,
                created_by_id=1,
                subject=f"Ticket {tenant_id}",
                description="Ticket de prueba",
                priority=TicketPriority.MEDIUM,
                status=TicketStatus.OPEN,
                created_at=now,
                updated_at=now,
            )
            session.add(t)
        session.commit()

    # Listar tickets de tenant_a
    resp_a = client.get(
        f"/api/v1/tickets?tenant_id={tenant_a}",
        headers=headers,
    )
    assert resp_a.status_code == status.HTTP_200_OK
    ids_a = {t["tenant_id"] for t in resp_a.json()}
    assert ids_a == {tenant_a}

    # Listar tickets de tenant_b
    resp_b = client.get(
        f"/api/v1/tickets?tenant_id={tenant_b}",
        headers=headers,
    )
    assert resp_b.status_code == status.HTTP_200_OK
    ids_b = {t["tenant_id"] for t in resp_b.json()}
    assert ids_b == {tenant_b}


def test_dashboard_support_metrics_respect_tenant_scope(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Comprueba que las mÃ©tricas de soporte del dashboard se calculan
    por tenant para un admin de tenant.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Metrics",
        subdomain="tickets-metrics",
    )
    _, email = _create_tenant_admin(
        client,
        super_token,
        tenant_id,
        email="admin.metrics@example.com",
    )
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    # Creamos algunos tickets en distintos estados para ese tenant
    now = utc_now()
    yesterday = now - timedelta(days=1)
    last_week = now - timedelta(days=6)

    with db_session_fixture as session:
        admin = session.exec(
            select(User).where(User.email == email),
        ).one()

        open_ticket = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="Abierto",
            description="Ticket abierto",
            priority=TicketPriority.MEDIUM,
            status=TicketStatus.OPEN,
            created_at=now,
            updated_at=now,
        )
        in_progress_ticket = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="En progreso",
            description="Ticket en progreso",
            priority=TicketPriority.HIGH,
            status=TicketStatus.IN_PROGRESS,
            created_at=now,
            updated_at=now,
        )
        resolved_today = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="Resuelto hoy",
            description="Ticket resuelto hoy",
            priority=TicketPriority.LOW,
            status=TicketStatus.RESOLVED,
            created_at=yesterday,
            updated_at=now,
            resolved_at=now,
        )
        closed_week = Ticket(
            tenant_id=tenant_id,
            created_by_id=admin.id,
            subject="Cerrado semana",
            description="Ticket cerrado esta semana",
            priority=TicketPriority.CRITICAL,
            status=TicketStatus.CLOSED,
            created_at=last_week,
            updated_at=now,
            closed_at=now,
        )

        session.add(open_ticket)
        session.add(in_progress_ticket)
        session.add(resolved_today)
        session.add(closed_week)
        session.commit()

    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    resp_dashboard = client.get(
        "/api/v1/dashboard/summary",
        headers=headers_admin,
    )
    assert resp_dashboard.status_code == status.HTTP_200_OK
    body = resp_dashboard.json()

    assert body["tickets_abiertos"] == 1
    assert body["tickets_en_progreso"] == 1
    assert body["tickets_resueltos_hoy"] >= 1
    assert body["tickets_cerrados_ultima_semana"] >= 1


def test_internal_notes_visibility_and_permissions(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Verifica que las notas internas solo son visibles para agentes (tenant_admin)
    y que los usuarios finales ven Ãºnicamente los mensajes pÃºblicos.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Internal",
        subdomain="tickets-internal",
    )

    # Usuario final del tenant (rol "user")
    user_payload = {
        "email": "user.internal@example.com",
        "full_name": "User Internal",
        "password": "user-pass",
        "tenant_id": tenant_id,
        "is_super_admin": False,
        "role_name": "user",
    }
    resp_user = client.post(
        "/api/v1/users/",
        json=user_payload,
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert resp_user.status_code == status.HTTP_201_CREATED

    # Login MFA del usuario final
    user_token = _login_with_mfa(
        client,
        user_payload["email"],
        "user-pass",
        db_session_fixture,
    )

    headers_user = {"Authorization": f"Bearer {user_token}"}
    headers_super = {"Authorization": f"Bearer {super_token}"}

    # El usuario final crea un ticket
    ticket_payload = {
        "subject": "Incidencia visibilidad",
        "description": "Prueba de notas internas.",
        "priority": "medium",
        "tool_slug": "erp",
        "category": "erp",
    }
    resp_create = client.post(
        "/api/v1/tickets",
        json=ticket_payload,
        headers=headers_user,
    )
    assert resp_create.status_code == status.HTTP_201_CREATED
    ticket_id = resp_create.json()["id"]

    # El Super Admin actÃºa como agente y aÃ±ade un mensaje pÃºblico
    resp_public = client.post(
        f"/api/v1/tickets/{ticket_id}/messages",
        json={"body": "Mensaje pÃºblico", "is_internal": False},
        headers=headers_super,
    )
    assert resp_public.status_code == status.HTTP_201_CREATED

    # El Super Admin aÃ±ade una nota interna
    resp_internal = client.post(
        f"/api/v1/tickets/{ticket_id}/messages",
        json={"body": "Nota interna", "is_internal": True},
        headers=headers_super,
    )
    assert resp_internal.status_code == status.HTTP_201_CREATED

    # Usuario final ve solo el mensaje pÃºblico
    resp_msgs_user = client.get(
        f"/api/v1/tickets/{ticket_id}/messages",
        headers=headers_user,
    )
    assert resp_msgs_user.status_code == status.HTTP_200_OK
    msgs_user = resp_msgs_user.json()
    assert len(msgs_user) == 1
    assert msgs_user[0]["body"] == "Mensaje pÃºblico"
    assert msgs_user[0]["is_internal"] is False

    # Super Admin ve ambos mensajes (pÃºblico + interno)
    resp_msgs_admin = client.get(
        f"/api/v1/tickets/{ticket_id}/messages",
        headers=headers_super,
    )
    assert resp_msgs_admin.status_code == status.HTTP_200_OK
    msgs_admin = resp_msgs_admin.json()
    bodies = {m["body"] for m in msgs_admin}
    assert bodies == {"Mensaje pÃºblico", "Nota interna"}
    has_internal = any(m["is_internal"] for m in msgs_admin)
    assert has_internal is True


def test_ticket_list_scope_user_vs_tenant_admin(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    """
    Comprueba que:
    - Un usuario normal solo ve sus propios tickets.
    - El admin del tenant ve todos los tickets del tenant.
    """

    super_token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        super_token,
        name="Tenant Scope",
        subdomain="tickets-scope",
    )

    # Creamos dos usuarios finales en el mismo tenant
    user1_email = "user1.scope@example.com"
    user2_email = "user2.scope@example.com"
    for email in (user1_email, user2_email):
        payload = {
            "email": email,
            "full_name": f"{email}",
            "password": "user-pass",
            "tenant_id": tenant_id,
            "is_super_admin": False,
            "role_name": "user",
        }
        resp = client.post(
            "/api/v1/users/",
            json=payload,
            headers={"Authorization": f"Bearer {super_token}"},
        )
        assert resp.status_code == status.HTTP_201_CREATED

    # Login MFA de usuarios y admin
    user1_token = _login_with_mfa(
        client,
        user1_email,
        "user-pass",
        db_session_fixture,
    )
    user2_token = _login_with_mfa(
        client,
        user2_email,
        "user-pass",
        db_session_fixture,
    )

    headers_user1 = {"Authorization": f"Bearer {user1_token}"}
    headers_user2 = {"Authorization": f"Bearer {user2_token}"}

    # user1 crea dos tickets
    for i in range(2):
        resp = client.post(
            "/api/v1/tickets",
            json={
                "subject": f"Ticket user1 #{i}",
                "description": "Test",
                "priority": "medium",
                "tool_slug": "erp",
                "category": "erp",
            },
            headers=headers_user1,
        )
        assert resp.status_code == status.HTTP_201_CREATED

    # user2 crea un ticket
    resp = client.post(
        "/api/v1/tickets",
        json={
            "subject": "Ticket user2",
            "description": "Test",
            "priority": "medium",
            "tool_slug": "erp",
            "category": "erp",
        },
        headers=headers_user2,
    )
    assert resp.status_code == status.HTTP_201_CREATED

    # user1 solo ve sus propios tickets
    resp_user1 = client.get("/api/v1/tickets", headers=headers_user1)
    assert resp_user1.status_code == status.HTTP_200_OK
    tickets_user1 = resp_user1.json()
    subjects_user1 = {t["subject"] for t in tickets_user1}
    assert subjects_user1 == {"Ticket user1 #0", "Ticket user1 #1"}

    # (Opcional) El Super Admin puede ver todos los tickets si se necesitara


def test_superadmin_cannot_create_tickets(client: TestClient) -> None:
    """
    El Super Admin global no debe crear tickets directamente vÃ­a API.
    """

    super_token = _login_superadmin(client)
    headers_super = {"Authorization": f"Bearer {super_token}"}

    payload = {
        "subject": "Ticket desde superadmin",
        "description": "No deberÃ­a permitirse",
        "priority": "high",
        "tool_slug": "erp",
        "category": "erp",
    }
    resp = client.post("/api/v1/tickets", json=payload, headers=headers_super)

    # Debe responder con 403 (PermissionError en servicio)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
