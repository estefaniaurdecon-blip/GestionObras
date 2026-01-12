from datetime import datetime
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


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def create_user_invitation(
    session: Session,
    current_user: User,
    data: UserInvitationCreate,
) -> UserInvitationRead:
    """
    Crea una invitación de usuario y envía un correo con el enlace.

    Solo permitido para:
    - Super Admin (para cualquier tenant).
    - tenant_admin del propio tenant.
    """

    if not current_user.is_super_admin and not current_user.tenant_id:
        raise PermissionError("Solo usuarios asociados a un tenant pueden invitar.")

    # Determinar tenant de la invitación.
    tenant_id: int
    if current_user.is_super_admin:
        if not data.tenant_id:
            raise ValueError("Debe indicarse el tenant para la invitación.")
        tenant_id = data.tenant_id
    else:
        tenant_id = current_user.tenant_id  # type: ignore[assignment]

    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise ValueError("Tenant no encontrado.")

    # Validar rol
    role = session.exec(select(Role).where(Role.name == data.role_name)).one_or_none()
    if not role:
        raise ValueError("Rol de invitación no válido.")

    # Eliminar invitaciones antiguas para el mismo email+tenant.
    existing_invites = session.exec(
        select(UserInvitation).where(
            UserInvitation.email == data.email,
            UserInvitation.tenant_id == tenant_id,
        ),
    ).all()
    for inv in existing_invites:
        # No las borramos físicamente, solo las marcamos como usadas si no lo estaban.
        if not inv.used_at:
            inv.used_at = datetime.utcnow()
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

    # Enviar email de invitación
    frontend_url = getattr(settings, "frontend_base_url", "http://localhost:5173")
    accept_url = f"{frontend_url}/accept-invitation?token={token}"

    try:
        send_user_invitation_email(
            to_email=invitation.email,
            tenant_name=tenant.name,
            accept_url=accept_url,
            role_name=data.role_name,
        )
    except Exception:
        # No rompemos la invitación si el correo falla.
        pass

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="user.invitation.create",
        details=f"Invitación creada para {invitation.email} en tenant_id={tenant_id}",
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
    Devuelve información reducida sobre una invitación.
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

    now = datetime.utcnow()
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
    Acepta una invitación creando el usuario asociado.
    """

    invitation = session.exec(
        select(UserInvitation).where(UserInvitation.token == data.token),
    ).one_or_none()
    if not invitation:
        raise ValueError("Invitación no encontrada.")

    now = datetime.utcnow()
    if invitation.used_at is not None:
        raise ValueError("La invitación ya ha sido utilizada.")
    if invitation.expires_at < now:
        raise ValueError("La invitación ha caducado.")

    tenant = session.get(Tenant, invitation.tenant_id)
    if not tenant:
        raise ValueError("Tenant asociado a la invitación no encontrado.")

    # Verificamos que no exista ya un usuario con ese email.
    existing_user = session.exec(
        select(User).where(User.email == invitation.email),
    ).one_or_none()
    if existing_user:
        raise ValueError("Ya existe un usuario con este email.")

    # Usuario que "crea" a efectos de auditoría es el creador de la invitación.
    created_by = session.get(User, invitation.created_by_id)
    if not created_by:
        raise ValueError("Usuario creador de la invitación no encontrado.")

    user_payload = UserCreate(
        email=invitation.email,
        full_name=data.full_name,
        password=data.password,
        tenant_id=invitation.tenant_id,
        is_super_admin=False,
        role_name=invitation.role_name,
    )

    # Reutilizamos la lógica de creación de usuarios existente.
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
        details=f"Invitación aceptada para {invitation.email}",
    )
