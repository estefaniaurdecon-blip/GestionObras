from typing import Annotated, Callable, Iterable, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from jose import JWTError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_session
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.user import User


def get_current_user(
    authorization: Annotated[Optional[str], Header(alias="Authorization")] = None,
    session: Session = Depends(get_session),
) -> User:
  """
  Dependencia para obtener el usuario actual a partir del header Authorization.

  Espera un header del tipo:
  - `Authorization: Bearer <token>`
  """

  if not authorization or not authorization.startswith("Bearer "):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Token de autenticación no proporcionado",
    )

  token = authorization.split(" ", 1)[1]

  try:
    payload = decode_token(token)
  except JWTError:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Token no válido o expirado",
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
  """
  Dependencia para obtener el tenant actual.

  Soporta dos estrategias:
  1. Por cabecera `X-Tenant-Id` (útil en desarrollo o integraciones internas).
  2. Por subdominio real, usando el header `Host`.
  """

  tenant: Optional[Tenant] = None

  # 1) Prioridad al header explícito (útil en desarrollo).
  if x_tenant_id is not None:
    tenant = session.get(Tenant, x_tenant_id)
  else:
    # 2) Resolución por subdominio.
    host = request.headers.get("host", "")
    # Eliminamos el puerto si viene incluido (ej: "acme.empresa.com:8000")
    host_without_port = host.split(":", 1)[0]
    primary_domain = settings.primary_domain

    # Se espera algo tipo "<subdominio>.<dominio_principal>"
    if not host_without_port.endswith(primary_domain):
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Host no coincide con el dominio principal configurado",
      )

    # Si el host es exactamente el dominio principal, no sabemos el tenant.
    if host_without_port == primary_domain:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Se requiere subdominio para resolver el tenant",
      )

    # Extraemos el subdominio antes del dominio principal.
    # Ej: "acme.empresa.com" -> "acme"
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
  """
  Variante de `get_current_user` que garantiza que el usuario está activo.
  """

  if not current_user.is_active:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Usuario inactivo",
    )
  return current_user


def get_current_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
  """
  Dependencia para restringir endpoints a Super Admin global.
  """

  if not current_user.is_super_admin:
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Se requieren permisos de Super Admin",
    )
  return current_user


def require_permissions(required_codes: Iterable[str]) -> Callable[[User, Session], User]:
  """
  Crea una dependencia que valida que el usuario actual tiene los permisos necesarios.

  Reglas:
  - Un Super Admin siempre pasa la comprobación.
  - En caso contrario, se comprueban los permisos asociados a su rol.
  """

  required_set = set(required_codes)

  def _dependency(
      current_user: User = Depends(get_current_active_user),
      session: Session = Depends(get_session),
  ) -> User:
    # Super Admin tiene acceso completo por definición.
    if current_user.is_super_admin:
      return current_user

    if not current_user.role_id:
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="El usuario no tiene rol asignado",
      )

    statement = (
      select(Permission)
      .join(RolePermission, RolePermission.permission_id == Permission.id)
      .where(RolePermission.role_id == current_user.role_id)
    )
    # Obtenemos el conjunto de códigos de permiso del rol.
    permissions = session.exec(statement).all()
    role_permissions = {perm.code for perm in permissions}

    if not required_set.issubset(role_permissions):
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Permisos insuficientes para realizar esta acción",
      )

    return current_user

  return _dependency


def require_any_permissions(required_codes: Iterable[str]) -> Callable[[User, Session], User]:
  """
  Valida que el usuario tenga al menos uno de los permisos requeridos.
  """

  required_set = set(required_codes)

  def _dependency(
      current_user: User = Depends(get_current_active_user),
      session: Session = Depends(get_session),
  ) -> User:
    if current_user.is_super_admin:
      return current_user

    if not current_user.role_id:
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="El usuario no tiene rol asignado",
      )

    statement = (
      select(Permission)
      .join(RolePermission, RolePermission.permission_id == Permission.id)
      .where(RolePermission.role_id == current_user.role_id)
    )
    permissions = session.exec(statement).all()
    role_permissions = {perm.code for perm in permissions}

    if required_set.isdisjoint(role_permissions):
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Permisos insuficientes para realizar esta acciИn",
      )

    return current_user

  return _dependency
