from datetime import datetime
from app.core.datetime import utc_now
import secrets

from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.config import settings
from app.core.email import send_user_invitation_email
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_invitation import UserInvitation
from app.models.role import Role
from app.schemas.invitation import (
    UserInvitationAccept,
    UserInvitationCreate,
    UserInvitationRead,
    UserInvitationValidateResponse,
)
from app.schemas.user import UserCreate
from app.services.external_account_service import sync_moodle_user
from app.services.user_service import create_user

INVITABLE_ROLES = {"tenant_admin", "usuario"}


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def create_user_invitation(
    session: Session,
    current_user: User,
    data: UserInvitationCreate,
) -> UserInvitationRead:
    """
    Crea una invitaciÃ³n de usuario y envÃ­a un correo con el enlace.

    Solo permitido para:
    - Super Admin (para cualquier tenant).
    - tenant_admin del propio tenant.
    """

    if not current_user.is_super_admin and not current_user.tenant_id:
        raise PermissionError("Solo usuarios asociados a un tenant pueden invitar.")

    # Determinar tenant de la invitaciÃ³n.
    tenant_id: int
    if current_user.is_super_admin:
        if not data.tenant_id:
            raise ValueError("Debe indicarse el tenant para la invitaciÃ³n.")
        tenant_id = data.tenant_id
    else:
        tenant_id = current_user.tenant_id  # type: ignore[assignment]

    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise ValueError("Tenant no encontrado.")

    # Validar rol
    if data.role_name not in INVITABLE_ROLES:
        raise ValueError("Rol de invitacion no valido.")

    role = session.exec(select(Role).where(Role.name == data.role_name)).one_or_none()
    if not role:
        raise ValueError("Rol de invitaciÃ³n no vÃ¡lido.")

    # Eliminar invitaciones antiguas para el mismo email+tenant.
    existing_invites = session.exec(
        select(UserInvitation).where(
            UserInvitation.email == data.email,
            UserInvitation.tenant_id == tenant_id,
        ),
    ).all()
    for inv in existing_invites:
        # No las borramos fÃ­sicamente, solo las marcamos como usadas si no lo estaban.
        if not inv.used_at:
            inv.used_at = utc_now()
            session.add(inv)

    token = _generate_token()

    invitation = UserInvitation(
        email=str(data.email),
        full_name=data.full_name,
        tenant_id=tenant_id,
        role_name=data.role_name,
        token=token,
        created_by_id=current_user.id,
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    # Enviar email de invitaciÃ³n
    frontend_url = settings.frontend_base_url
    if not frontend_url:
        raise ValueError("FRONTEND_BASE_URL no configurado.")
    accept_url = f"{frontend_url}/accept-invitation?token={token}"

    try:
        send_user_invitation_email(
            to_email=invitation.email,
            tenant_name=tenant.name,
            accept_url=accept_url,
            role_name=data.role_name,
        )
    except Exception:
        # No rompemos la invitaciÃ³n si el correo falla.
        pass

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="user.invitation.create",
        details=f"InvitaciÃ³n creada para {invitation.email} en tenant_id={tenant_id}",
    )

    return UserInvitationRead(
        id=invitation.id,
        email=invitation.email,
        full_name=invitation.full_name,
        tenant_id=invitation.tenant_id,
        role_name=invitation.role_name,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        used_at=invitation.used_at,
    )


def validate_invitation(
    session: Session,
    token: str,
) -> UserInvitationValidateResponse:
    """
    Devuelve informaciÃ³n reducida sobre una invitaciÃ³n.
    """


    invitation = session.exec(
        select(UserInvitation).where(UserInvitation.token == token),
    ).one_or_none()

    if not invitation:
        return UserInvitationValidateResponse(
            email="invalid@example.com",
            full_name=None,
            tenant_name="",
            role_name="",
            is_valid=False,
            is_used=False,
            is_expired=False,
        )

    tenant = session.get(Tenant, invitation.tenant_id)
    tenant_name = tenant.name if tenant else ""

    now = utc_now()
    is_used = invitation.used_at is not None
    is_expired = invitation.expires_at < now

    return UserInvitationValidateResponse(
        email=invitation.email,
        full_name=invitation.full_name,
        tenant_name=tenant_name,
        role_name=invitation.role_name,
        is_valid=not is_used and not is_expired,
        is_used=is_used,
        is_expired=is_expired,
    )


def accept_invitation(
    session: Session,
    data: UserInvitationAccept,
) -> None:
    """
    Acepta una invitaciÃ³n creando el usuario asociado.
    """


    invitation = session.exec(
        select(UserInvitation).where(UserInvitation.token == data.token),
    ).one_or_none()
    if not invitation:
        raise ValueError("InvitaciÃ³n no encontrada.")

    now = utc_now()
    if invitation.used_at is not None:
        raise ValueError("La invitaciÃ³n ya ha sido utilizada.")
    if invitation.expires_at < now:
        raise ValueError("La invitaciÃ³n ha caducado.")

    if data.password != data.password_confirm:
        raise ValueError("La contraseÃ±a y su confirmaciÃ³n deben ser iguales.")

    tenant = session.get(Tenant, invitation.tenant_id)
    if not tenant:
        raise ValueError("Tenant asociado a la invitaciÃ³n no encontrado.")

    # Verificamos que no exista ya un usuario con ese email.
    existing_user = session.exec(
        select(User).where(User.email == invitation.email),
    ).one_or_none()
    if existing_user:
        raise ValueError("Ya existe un usuario con este email.")

    # Usuario que "crea" a efectos de auditorÃ­a es el creador de la invitaciÃ³n.
    created_by = session.get(User, invitation.created_by_id)
    if not created_by:
        raise ValueError("Usuario creador de la invitaciÃ³n no encontrado.")

    user_payload = UserCreate(
        email=invitation.email,
        full_name=data.full_name,
        password=data.password,
        tenant_id=invitation.tenant_id,
        is_super_admin=False,
        role_name=invitation.role_name,
    )

    # Reutilizamos la lÃ³gica de creaciÃ³n de usuarios existente.
    create_user(
        session=session,
        current_user=created_by,
        user_in=user_payload,
    )

    sync_moodle_user(
        email=invitation.email,
        full_name=data.full_name,
        password=data.password,
    )

    invitation.used_at = now
    session.add(invitation)
    session.commit()

    log_action(
        session=session,
        user_id=created_by.id,
        tenant_id=invitation.tenant_id,
        action="user.invitation.accept",
        details=f"InvitaciÃ³n aceptada para {invitation.email}",
    )
