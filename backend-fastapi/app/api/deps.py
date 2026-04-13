from typing import Annotated, Callable, Iterable, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import JWTError, decode_token
from app.db.session import get_session
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.user import User


def _collect_user_permission_codes(session: Session, user: User) -> set[str]:
    if not user.role_id:
        return set()

    statement = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == user.role_id)
    )
    permissions: set[str] = set()
    for row in session.exec(statement).all():
        if isinstance(row, str):
            permissions.add(row)
        elif row and row[0]:
            permissions.add(row[0])
    return permissions


def get_current_user(
    request: Request,
    authorization: Annotated[Optional[str], Header(alias="Authorization")] = None,
    session: Session = Depends(get_session),
) -> User:
    token: Optional[str] = None
    if authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de autenticacion no proporcionado",
            )
        token = authorization.split(" ", 1)[1]
    else:
        token = request.cookies.get(settings.auth_cookie_name)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticacion no proporcionado",
        )

    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token no valido o expirado",
        )

    token_type = payload.get("typ")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token no permitido",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin usuario",
        )

    user = session.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    return user


def get_current_tenant(
    request: Request,
    x_tenant_id: Annotated[Optional[int], Header(alias="X-Tenant-Id")] = None,
    session: Session = Depends(get_session),
) -> Tenant:
    tenant: Optional[Tenant] = None

    if x_tenant_id is not None:
        tenant = session.get(Tenant, x_tenant_id)
    else:
        host = request.headers.get("host", "")
        host_without_port = host.split(":", 1)[0]
        primary_domain = settings.primary_domain

        if not host_without_port.endswith(primary_domain):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Host no coincide con el dominio principal configurado",
            )

        if host_without_port == primary_domain:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se requiere subdominio para resolver el tenant",
            )

        suffix = f".{primary_domain}"
        subdomain = host_without_port[: -len(suffix)]

        statement = select(Tenant).where(Tenant.subdomain == subdomain)
        tenant = session.exec(statement).one_or_none()

    if not tenant or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant no encontrado o inactivo",
        )

    return tenant


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario inactivo",
        )
    return current_user


def get_current_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de Super Admin",
        )
    return current_user


def require_permissions(required_codes: Iterable[str]) -> Callable[[User, Session], User]:
    required_set = set(required_codes)

    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user

        role_permissions = _collect_user_permission_codes(session, current_user)
        if not role_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El usuario no tiene rol asignado",
            )

        if not required_set.issubset(role_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para realizar esta accion",
            )

        return current_user

    return _dependency


def require_any_permissions(required_codes: Iterable[str]) -> Callable[[User, Session], User]:
    required_set = set(required_codes)

    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user

        role_permissions = _collect_user_permission_codes(session, current_user)
        if not role_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El usuario no tiene rol asignado",
            )

        if required_set.isdisjoint(role_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para realizar esta accion",
            )

        return current_user

    return _dependency
