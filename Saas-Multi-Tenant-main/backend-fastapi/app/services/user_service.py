from typing import List

from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from app.core.audit import log_action
from app.core.security import hash_password
from app.core.email import send_tenant_admin_welcome_email
from app.models.hr import EmployeeProfile
from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.audit_log import AuditLog
from app.schemas.user import (
    UserCreate,
    UserRead,
    UserUpdateMe,
    UserStatusUpdate,
)


def get_user_me(current_user: User) -> UserRead:
    """
    Devuelve la representación de lectura del usuario actual.
    """

    return UserRead(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_super_admin=current_user.is_super_admin,
        tenant_id=current_user.tenant_id,
        role_id=current_user.role_id,
        created_at=current_user.created_at,
    )


def list_users_by_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
    exclude_assigned: bool = False,
) -> List[UserRead]:
    """
    Lista usuarios de un tenant concreto, aplicando reglas de acceso.
    """

    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para ver este tenant")

    tenant_exists = session.get(Tenant, tenant_id)
    if not tenant_exists:
        raise LookupError("Tenant no encontrado")

    stmt = select(User).where(User.tenant_id == tenant_id)
    if exclude_assigned:
        assigned_user_ids = session.exec(
            select(EmployeeProfile.user_id).where(
                EmployeeProfile.tenant_id == tenant_id,
                EmployeeProfile.user_id.is_not(None),
            ),
        ).all()
        assigned_set = {user_id for user_id in assigned_user_ids if user_id is not None}
        if assigned_set:
            stmt = stmt.where(User.id.notin_(assigned_set))

    users = session.exec(stmt).all()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="user.list",
        details=f"Listado de {len(users)} usuarios para tenant_id={tenant_id}",
    )

    result: List[UserRead] = []
    for u in users:
        result.append(
            UserRead(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_active=u.is_active,
                is_super_admin=u.is_super_admin,
                tenant_id=u.tenant_id,
                role_id=u.role_id,
                created_at=u.created_at,
            ),
        )

    return result


def update_user_me(
    session: Session,
    current_user: User,
    data: UserUpdateMe,
) -> UserRead:
    """
    Actualiza los datos básicos del propio usuario (perfil).
    """

    current_user.full_name = data.full_name
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        action="user.update_me",
        details="Actualización de perfil del propio usuario",
    )

    return UserRead(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_super_admin=current_user.is_super_admin,
        tenant_id=current_user.tenant_id,
        role_id=current_user.role_id,
        created_at=current_user.created_at,
    )


def create_user(
    session: Session,
    current_user: User,
    user_in: UserCreate,
) -> UserRead:
    """
    Crea un nuevo usuario global o por tenant.

    Se asume que el control de permisos (ej. solo Super Admin o tenant_admin)
    se aplica en la capa de rutas.
    """

    existing = session.exec(
        select(User).where(User.email == user_in.email),
    ).one_or_none()
    if existing:
        raise ValueError("Ya existe un usuario con ese email")

    role_id: int | None = None
    if user_in.role_name:
        role = session.exec(
            select(Role).where(Role.name == user_in.role_name),
        ).one_or_none()
        if not role:
            raise ValueError("Rol no válido")
        role_id = role.id

    # Los usuarios no Super Admin se crean inactivos hasta que completen MFA.
    # Super Admin (solo el usuario semilla) se crea activo.
    is_active = True if user_in.is_super_admin else False

    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=hash_password(user_in.password),
        tenant_id=user_in.tenant_id,
        is_super_admin=user_in.is_super_admin,
        role_id=role_id,
        is_active=is_active,
    )

    session.add(user)
    session.commit()
    session.refresh(user)

    # Si es un admin de tenant, intentamos enviar correo de bienvenida.
    if user.tenant_id and user_in.role_name == "tenant_admin":
        tenant = session.get(Tenant, user.tenant_id)
        if tenant:
            try:
                send_tenant_admin_welcome_email(
                    to_email=user.email,
                    tenant_name=tenant.name,
                    plain_password=user_in.password,
                )
            except Exception:
                # No rompemos la creación del usuario si el correo falla.
                pass

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.create",
        details=f"Usuario creado con email '{user.email}'",
    )

    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        tenant_id=user.tenant_id,
        role_id=user.role_id,
        created_at=user.created_at,
    )


def delete_user(
    session: Session,
    current_user: User,
    user_id: int,
) -> None:
    """
    Elimina un usuario, aplicando reglas de acceso.
    """

    user = session.get(User, user_id)
    if not user:
        raise LookupError("Usuario no encontrado")

    # No permitimos borrar al Super Admin global
    if user.is_super_admin:
        raise PermissionError("No se puede eliminar al Super Admin global")

    # Reglas de acceso:
    # - Super Admin puede borrar cualquier usuario no-super-admin.
    # - Un tenant_admin solo puede borrar usuarios de su mismo tenant.
    if not current_user.is_super_admin:
        if current_user.tenant_id is None or current_user.tenant_id != user.tenant_id:
            raise PermissionError("No tienes permisos para eliminar este usuario")

    # Antes de borrar el usuario, desvinculamos sus registros de auditoría
    # para no perder el histórico pero evitar el error de clave foránea.
    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == user.id),
    ).all()
    for log in logs:
        log.user_id = None
        session.add(log)

    try:
        session.delete(user)
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise PermissionError(
            "No se puede eliminar este usuario porque tiene registros de auditoría asociados. "
            "Desactívalo en su lugar.",
        ) from exc

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.delete",
        details=f"Usuario eliminado con email '{user.email}'",
    )


def update_user_status(
    session: Session,
    current_user: User,
    user_id: int,
    data: UserStatusUpdate,
) -> UserRead:
    """
    Activa o desactiva un usuario, aplicando reglas de acceso similares a delete_user.
    """

    user = session.get(User, user_id)
    if not user:
        raise LookupError("Usuario no encontrado")

    # No permitimos desactivar al Super Admin global
    if user.is_super_admin:
        raise PermissionError("No se puede desactivar al Super Admin global")

    # Reglas de acceso:
    # - Super Admin puede cambiar cualquier usuario no-super-admin.
    # - Un tenant_admin solo puede cambiar usuarios de su mismo tenant.
    if not current_user.is_super_admin:
        if current_user.tenant_id is None or current_user.tenant_id != user.tenant_id:
            raise PermissionError("No tienes permisos para actualizar este usuario")

    user.is_active = data.is_active
    session.add(user)
    session.commit()
    session.refresh(user)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.status_update",
        details=(
            f"Usuario {'activado' if data.is_active else 'desactivado'} con email "
            f"'{user.email}'"
        ),
    )

    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        tenant_id=user.tenant_id,
        role_id=user.role_id,
        created_at=user.created_at,
    )
