from pathlib import Path
from typing import List

import base64
from fastapi import UploadFile
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from app.core.audit import log_action
from app.core.config import settings
from app.core.security import hash_password
from app.core.email import send_tenant_admin_welcome_email
from app.api.deps import _collect_user_permission_codes
from app.models.hr import EmployeeProfile
from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.audit_log import AuditLog
from app.schemas.user import (
    UserCreate,
    UserRead,
    UserUpdateAdmin,
    UserUpdateMe,
    UserStatusUpdate,
)

OFFICIAL_NON_SUPERADMIN_ROLES = {"tenant_admin", "gerencia", "user"}


def _resolve_avatar_url(avatar_url: str | None) -> str | None:
    if not avatar_url:
        return None
    if "/static/avatars/" not in avatar_url:
        return avatar_url
    filename = avatar_url.rsplit("/", 1)[-1]
    file_path = Path(settings.avatars_storage_path) / filename
    if not file_path.exists():
        return None
    return avatar_url


def _user_to_read(
    user: User,
    role_name: str | None = None,
    permissions: list[str] | None = None,
) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        tenant_id=user.tenant_id,
        role_id=user.role_id,
        role_name=role_name,
        permissions=permissions or [],
        language=user.language,
        avatar_url=_resolve_avatar_url(user.avatar_url),
        avatar_data=user.avatar_data,
        created_at=user.created_at,
    )


def get_user_me(session: Session, current_user: User) -> UserRead:
    """
    Devuelve la representación de lectura del usuario actual.
    """

    role_name: str | None = None
    role = session.get(Role, current_user.role_id) if current_user.role_id else None
    if role:
        role_name = role.name

    permissions = sorted(_collect_user_permission_codes(session, current_user))

    return _user_to_read(
        current_user,
        role_name=role_name,
        permissions=permissions,
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

    role_ids = {u.role_id for u in users if u.role_id}
    roles_by_id: dict[int, str] = {}
    if role_ids:
        roles = session.exec(select(Role).where(Role.id.in_(role_ids))).all()
        roles_by_id = {role.id: role.name for role in roles if role.id is not None}

    result: List[UserRead] = []
    for u in users:
        result.append(_user_to_read(u, role_name=roles_by_id.get(u.role_id)))

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
    if data.language is not None:
        current_user.language = data.language
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url.strip() or None
        current_user.avatar_data = None
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

    return _user_to_read(current_user)


def update_user_avatar(
    session: Session,
    current_user: User,
    upload: UploadFile,
) -> UserRead:
    """
    Actualiza la foto de perfil del usuario autenticado.
    """

    content_type = getattr(upload, "content_type", None) or ""
    ext_map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    extension = ext_map.get(content_type)
    if not extension:
        raise ValueError("Formato de imagen no soportado (jpeg, png, webp)")

    max_bytes = 5 * 1024 * 1024  # 5MB
    content = upload.file.read()
    if len(content) > max_bytes:
        raise ValueError("La imagen supera el tamaño máximo de 5MB")

    encoded = base64.b64encode(content).decode("ascii")
    current_user.avatar_data = f"data:{content_type};base64,{encoded}"
    current_user.avatar_url = None
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        action="user.update_avatar",
        details="Actualización de foto de perfil",
    )

    return _user_to_read(current_user)


def update_user_admin(
    session: Session,
    current_user: User,
    user_id: int,
    data: UserUpdateAdmin,
) -> UserRead:
    """
    Actualiza datos básicos de un usuario (admin).
    """

    user = session.get(User, user_id)
    if not user:
        raise LookupError("Usuario no encontrado")

    if not current_user.is_super_admin:
        if user.is_super_admin:
            raise PermissionError("No puedes editar un Super Admin")
        if current_user.tenant_id != user.tenant_id:
            raise PermissionError("No tienes permisos para editar este usuario")

    if data.email is not None:
        email = data.email.strip().lower()
        if not email:
            raise ValueError("Email no válido")
        existing = session.exec(select(User).where(User.email == email)).one_or_none()
        if existing and existing.id != user.id:
            raise ValueError("Ya existe un usuario con ese email")
        user.email = email

    if data.full_name is not None:
        user.full_name = data.full_name.strip()

    if data.role_name is not None:
        if data.role_name == "super_admin" and not current_user.is_super_admin:
            raise PermissionError("No tienes permisos para asignar rol Super Admin")
        if data.role_name == "gerencia":
            raise ValueError("El rol Gerencia se asigna automaticamente por departamento.")
        role = session.exec(
            select(Role).where(Role.name == data.role_name),
        ).one_or_none()
        if not role:
            raise ValueError("Rol no válido")
        user.role_id = role.id

    session.add(user)
    session.commit()
    session.refresh(user)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.update",
        details=f"Actualización de usuario_id={user.id}",
    )

    role_name = None
    if user.role_id:
        role = session.get(Role, user.role_id)
        role_name = role.name if role else None

    return _user_to_read(user, role_name=role_name)


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

    if not current_user.is_super_admin:
        if user_in.is_super_admin:
            raise PermissionError("Solo el Super Admin puede crear otro Super Admin")
        if user_in.tenant_id is None:
            raise PermissionError("Debes indicar un tenant para crear usuarios")
        if current_user.tenant_id != user_in.tenant_id:
            raise PermissionError("No tienes permisos para crear usuarios en otro tenant")
        if user_in.role_name == "super_admin":
            raise PermissionError("No tienes permisos para asignar rol Super Admin")

    if user_in.role_name:
        if user_in.role_name == "super_admin":
            if not current_user.is_super_admin or not user_in.is_super_admin:
                raise ValueError("Rol no permitido para este usuario")
        elif user_in.role_name == "gerencia":
            raise ValueError("El rol Gerencia se asigna automaticamente por departamento.")
        elif user_in.role_name not in OFFICIAL_NON_SUPERADMIN_ROLES:
            raise ValueError("Rol no permitido para este usuario")

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

    return _user_to_read(user, role_name=user_in.role_name)


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

    return _user_to_read(user)
