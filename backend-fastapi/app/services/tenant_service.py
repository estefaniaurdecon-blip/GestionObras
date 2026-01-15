from typing import List

from sqlmodel import Session, select

from app.core.audit import log_action
from app.models.tenant import Tenant
from app.models.user import User
from app.models.tenant_tool import TenantTool
from app.models.audit_log import AuditLog
from app.models.tool import Tool
from app.schemas.tenant import TenantCreate, TenantRead


def list_tenants(session: Session, current_user: User) -> List[TenantRead]:
    """
    Lista todos los tenants en el sistema.

    Se asume que el control de permisos ya se ha realizado
    (ej: require_permissions en la capa de rutas).
    """

    tenants = session.exec(select(Tenant)).all()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=None,
        action="tenant.list",
        details=f"Listado de {len(tenants)} tenants",
    )

    result: List[TenantRead] = []
    for t in tenants:
        result.append(
            TenantRead(
                id=t.id,
                name=t.name,
                subdomain=t.subdomain,
                is_active=t.is_active,
                created_at=t.created_at,
            ),
        )

    return result


def create_tenant(
    session: Session,
    current_user: User,
    tenant_in: TenantCreate,
) -> TenantRead:
    """
    Crea un nuevo tenant.
    """

    existing = session.exec(
        select(Tenant).where(Tenant.subdomain == tenant_in.subdomain),
    ).one_or_none()
    if existing:
        raise ValueError("Ya existe un tenant con ese subdominio")

    tenant = Tenant(
        name=tenant_in.name,
        subdomain=tenant_in.subdomain,
        is_active=tenant_in.is_active,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    # Asignamos todas las herramientas existentes al nuevo tenant, habilitadas.
    tools = session.exec(select(Tool)).all()
    for tool in tools:
        tt = TenantTool(tenant_id=tenant.id, tool_id=tool.id, is_enabled=True)
        session.add(tt)
    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant.id,
        action="tenant.create",
        details=f"Tenant creado con subdominio '{tenant.subdomain}'",
    )

    return TenantRead(
        id=tenant.id,
        name=tenant.name,
        subdomain=tenant.subdomain,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
    )


def delete_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
) -> None:
    """
    Elimina un tenant y deja a sus usuarios sin tenant (inactivos).
    Solo debería poder hacerlo un Super Admin.
    """

    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise LookupError("Tenant no encontrado")

    if not current_user.is_super_admin:
        raise PermissionError("Solo un Super Admin puede eliminar tenants")

    # Borramos relaciones con herramientas
    tenant_tools = session.exec(
        select(TenantTool).where(TenantTool.tenant_id == tenant_id),
    ).all()
    for tt in tenant_tools:
        session.delete(tt)

    # Limpiamos referencias en logs de auditoría al tenant
    logs = session.exec(
        select(AuditLog).where(AuditLog.tenant_id == tenant_id),
    ).all()
    for log in logs:
        log.tenant_id = None
        session.add(log)

    # Obtenemos usuarios del tenant
    users = session.exec(
        select(User).where(User.tenant_id == tenant_id),
    ).all()

    # Limpiamos referencias en logs de auditoría a esos usuarios
    user_ids = [user.id for user in users]
    if user_ids:
        user_logs = session.exec(
            select(AuditLog).where(AuditLog.user_id.in_(user_ids)),
        ).all()
        for log in user_logs:
            log.user_id = None
            session.add(log)

    # En lugar de borrar usuarios, los dejamos sin tenant, sin rol y desactivados
    for user in users:
        user.tenant_id = None
        user.role_id = None
        user.is_active = False
        session.add(user)

    # Persistimos cambios en logs y usuarios
    session.commit()

    # Ahora sí, borramos el propio tenant
    session.delete(tenant)
    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=None,
        action="tenant.delete",
        details=f"Tenant eliminado con subdominio '{tenant.subdomain}'",
    )

