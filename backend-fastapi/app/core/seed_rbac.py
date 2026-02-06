"""
Script de seed para RBAC (Roles y Permisos).

Este script es IDEMPOTENTE: puede ejecutarse varias veces sin duplicar datos.

Responsabilidades:
- Crear permisos base.
- Crear roles base.
- Asignar permisos a cada rol.
- Asignar el rol `tenant_admin` al primer usuario de cada tenant
  (solo si dicho usuario no es Super Admin y no tiene ya un rol asignado).

Ejecución:
    python -m app.core.seed_rbac
"""

from typing import Dict, Iterable, List

from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.config import settings
from app.core.migrate_roles_to_official import migrate_roles
from app.core.security import hash_password
from app.db import session as db_session
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.tool import Tool
from app.models.tenant_tool import TenantTool
from app.models.user import User


# Definición de permisos base (código + descripción).
BASE_PERMISSIONS: Dict[str, str] = {
    "tenants:read": "Ver listado de tenants",
    "tenants:create": "Crear nuevos tenants",
    "tenants:update": "Editar tenants",
    "tenants:delete": "Eliminar tenants",
    "users:read": "Ver usuarios",
    "users:create": "Crear usuarios",
    "users:delete": "Eliminar usuarios",
    "users:update": "Editar usuarios",
    "tools:read": "Ver catálogo de herramientas",
    "tools:launch": "Lanzar herramientas externas (ej. Moodle)",
    "tools:configure": "Configurar herramientas para tenants",
    "audit:read": "Consultar registros de auditoría",
}


# Roles base y sus permisos.
ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    # Super Admin: acceso total a todo el sistema (además de bypass en código).
    "super_admin": BASE_PERMISSIONS.keys(),
    # Admin de tenant: gestión del tenant propio (usuarios, herramientas, auditoría).
    "tenant_admin": {
        "users:read",
        "users:create",
        "users:delete",
        "users:update",
        "tools:read",
        "tools:launch",
        "tools:configure",
        "audit:read",
    },
    # Gerencia: acceso operativo del tenant (sin soporte, logs, herramientas ni ajustes de tenant).
    "gerencia": {
        "users:read",
    },
    # Usuario estándar: puede ver y lanzar herramientas asignadas.
    "user": {
        "tools:read",
        "tools:launch",
    },
}


def _get_or_create_permissions(session: Session) -> Dict[str, Permission]:
    """
    Crea (si no existen) los permisos base y devuelve un dict `code -> Permission`.
    """

    existing_permissions = session.exec(select(Permission)).all()
    by_code = {perm.code: perm for perm in existing_permissions}

    for code, description in BASE_PERMISSIONS.items():
        if code in by_code:
            # Actualizamos descripción si está vacía o es distinta.
            perm = by_code[code]
            if not perm.description:
                perm.description = description
        else:
            perm = Permission(code=code, description=description)
            session.add(perm)
            by_code[code] = perm

    session.commit()
    # Refrescamos por si se han creado nuevos registros.
    for perm in by_code.values():
        session.refresh(perm)

    return by_code


def _get_or_create_roles(session: Session) -> Dict[str, Role]:
    """
    Crea (si no existen) los roles base y devuelve un dict `name -> Role`.
    """

    existing_roles = session.exec(select(Role)).all()
    by_name = {role.name: role for role in existing_roles}

    for role_name in ROLE_PERMISSIONS.keys():
        if role_name in by_name:
            continue
        role = Role(
            name=role_name,
            description=f"Rol base: {role_name}",
        )
        session.add(role)
        by_name[role_name] = role

    session.commit()
    for role in by_name.values():
        session.refresh(role)

    return by_name


def _sync_role_permissions(
    session: Session,
    roles: Dict[str, Role],
    permissions: Dict[str, Permission],
) -> None:
    """
    Sincroniza la tabla intermedia RolePermission según la configuración ROLE_PERMISSIONS.

    - Solo añade relaciones que falten.
    - No elimina relaciones existentes (por si se han añadido manualmente).
    """

    existing = session.exec(select(RolePermission)).all()
    existing_map: Dict[tuple[int, int], RolePermission] = {
        (rp.role_id, rp.permission_id): rp for rp in existing
    }

    to_add: List[RolePermission] = []

    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        role = roles[role_name]
        for code in perm_codes:
            perm = permissions.get(code)
            if not perm:
                # Si falta un permiso declarado en ROLE_PERMISSIONS, lo ignoramos
                # (pero idealmente no debería ocurrir).
                continue

            key = (role.id, perm.id)
            if key in existing_map:
                continue

            to_add.append(
                RolePermission(
                    role_id=role.id,
                    permission_id=perm.id,
                ),
            )

    if to_add:
        session.add_all(to_add)
        session.commit()


def _assign_tenant_admin_to_first_users(session: Session, roles: Dict[str, Role]) -> None:
    """
    Asigna el rol `tenant_admin` al primer usuario de cada tenant.

    Criterios:
    - Solo usuarios que no sean Super Admin (`is_super_admin=False`).
    - Solo usuarios sin `role_id` asignado (para no romper configuraciones manuales).
    """

    tenant_admin_role = roles.get("tenant_admin")
    if not tenant_admin_role:
        return

    # Obtenemos todos los tenants.
    tenants = session.exec(select(Tenant)).all()

    for tenant in tenants:
        # Buscamos usuarios de ese tenant sin rol y que no sean super_admin,
        # ordenados por fecha de creación.
        users = session.exec(
            select(User)
            .where(
                User.tenant_id == tenant.id,
                User.is_super_admin.is_(False),
                User.role_id.is_(None),
            )
            .order_by(User.created_at),
        ).all()

        if not users:
            continue

        first_user = users[0]
        first_user.role_id = tenant_admin_role.id
        session.add(first_user)

    session.commit()


def _ensure_super_admin_user(session: Session, roles: Dict[str, Role]) -> None:
    """
    Crea (si no existe) un usuario Super Admin global con credenciales por defecto.

    El usuario:
    - Tiene `is_super_admin=True`.
    - No está asociado a ningún tenant (`tenant_id=None`).
    - Se le asigna el rol `super_admin` si existe.

    IMPORTANTE: en un entorno real, se recomienda cambiar la contraseña
    tras el primer inicio de sesión y/o configurar un sistema seguro de
    provisión de credenciales.
    """

    if settings.env == "production":
        return
    if not settings.allow_bootstrap_superadmin:
        return

    superadmin_role = roles.get("super_admin")

    existing = session.exec(
        select(User).where(User.email == settings.superadmin_email),
    ).one_or_none()

    if existing:
        # Si ya existe, nos aseguramos de que tenga la marca de Super Admin
        # y opcionalmente el rol asociado.
        changed = False
        if not existing.is_super_admin:
            existing.is_super_admin = True
            changed = True
        if superadmin_role and existing.role_id != superadmin_role.id:
            existing.role_id = superadmin_role.id
            changed = True
        if changed:
            session.add(existing)
            session.commit()
        return

    # Creamos el usuario Super Admin inicial.
    hashed_password = hash_password(settings.superadmin_password)

    user = User(
        email=settings.superadmin_email,
        full_name="Super Admin",
        hashed_password=hashed_password,
        is_active=True,
        is_super_admin=True,
        tenant_id=None,
        role_id=superadmin_role.id if superadmin_role else None,
        mfa_enabled=False,  # Super Admin está exento de MFA según requisitos.
    )

    session.add(user)
    session.commit()


def _ensure_default_tenant_and_tools(session: Session) -> None:
    """
    Crea (si no existen) un tenant por defecto y algunas herramientas de ejemplo.

    Esto facilita las pruebas locales para que el dashboard tenga datos reales.
    """

    # Tenant por defecto para desarrollo: Urdecon Innova.
    tenant = session.exec(
        select(Tenant).where(Tenant.subdomain == "mavico"),
    ).one_or_none()

    if not tenant:
        tenant = Tenant(
            name="Urdecon Innova",
            subdomain="mavico",
            is_active=True,
        )
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

    # Herramientas base de catálogo.
    frontend_base = settings.frontend_base_url or ""
    erp_base_url = (
        f"{frontend_base.rstrip('/')}/erp/projects" if frontend_base else ""
    )

    tools_def = [
        {
            "slug": "moodle",
            "name": "Moodle LMS",
            "base_url": "https://moodle.mavico.shop",
            "description": "Plataforma de formación online para tu organización.",
        },
        {
            "slug": "erp",
            "name": "ERP Interno",
            "base_url": erp_base_url,
            "description": "Modulo ERP integrado en el dashboard (FastAPI).",
        },
    ]

    existing_tools = {
        t.slug: t for t in session.exec(select(Tool)).all()
    }

    for td in tools_def:
        existing = existing_tools.get(td["slug"])
        if existing:
            changed = False
            if existing.name != td["name"]:
                existing.name = td["name"]
                changed = True
            if existing.base_url != td["base_url"]:
                existing.base_url = td["base_url"]
                changed = True
            if existing.description != td["description"]:
                existing.description = td["description"]
                changed = True
            if changed:
                session.add(existing)
                session.commit()
                session.refresh(existing)
            continue
        tool = Tool(
            name=td["name"],
            slug=td["slug"],
            base_url=td["base_url"],
            description=td["description"],
        )
        session.add(tool)
        session.commit()
        session.refresh(tool)
        existing_tools[td["slug"]] = tool

    # Asignamos todas las herramientas al tenant por defecto.
    existing_tenant_tools = session.exec(
        select(TenantTool).where(TenantTool.tenant_id == tenant.id),
    ).all()
    existing_pairs = {(tt.tenant_id, tt.tool_id) for tt in existing_tenant_tools}

    to_add: list[TenantTool] = []
    for tool in existing_tools.values():
        key = (tenant.id, tool.id)
        if key in existing_pairs:
            continue
        to_add.append(
            TenantTool(
                tenant_id=tenant.id,
                tool_id=tool.id,
                is_enabled=True,
            ),
        )

    if to_add:
        session.add_all(to_add)
        session.commit()


def _ensure_ticket_permissions(session: Session) -> None:
    """
    Crea (si no existen) los permisos de tickets de soporte y los asigna a roles base.

    Se mantiene separado de BASE_PERMISSIONS para no romper despliegues existentes,
    pero se puede invocar desde `run_seed` de forma idempotente.
    """

    # Definición de permisos específicos de tickets.
    ticket_permissions: Dict[str, str] = {
        "tickets:create": "Crear tickets de soporte",
        "tickets:read_own": "Ver sus propios tickets de soporte",
        "tickets:read_tenant": "Ver todos los tickets del tenant",
        "tickets:manage": (
            "Gestionar tickets del tenant (estado, asignación, notas internas)"
        ),
    }

    existing_permissions = session.exec(select(Permission)).all()
    perms_by_code: Dict[str, Permission] = {p.code: p for p in existing_permissions}

    # Creamos permisos que falten.
    for code, description in ticket_permissions.items():
        perm = perms_by_code.get(code)
        if perm is None:
            perm = Permission(code=code, description=description)
            session.add(perm)
            session.commit()
            session.refresh(perm)
            perms_by_code[code] = perm

    # Asignación a roles base.
    roles = {r.name: r for r in session.exec(select(Role)).all()}

    role_permission_map: Dict[str, Iterable[str]] = {
        "super_admin": ticket_permissions.keys(),
        "tenant_admin": ticket_permissions.keys(),
        "user": ("tickets:create", "tickets:read_own"),
    }

    for role_name, codes in role_permission_map.items():
        role = roles.get(role_name)
        if not role:
            continue

        existing_rps = session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id),
        ).all()
        existing_pairs = {
            (rp.role_id, rp.permission_id): rp for rp in existing_rps
        }

        for code in codes:
            perm = perms_by_code.get(code)
            if not perm:
                continue
            key = (role.id, perm.id)
            if key in existing_pairs:
                continue
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    session.commit()


def _ensure_hr_permissions(session: Session) -> None:
    """
    Crea (si no existen) los permisos de Recursos Humanos y los asigna a roles base.
    """

    hr_permissions: Dict[str, str] = {
        "hr:read": "Ver departamentos y empleados del tenant",
        "hr:manage": "Gestionar departamentos y perfiles de empleado del tenant",
        "hr:reports": "Acceder a informes agregados de RRHH",
    }

    existing_permissions = session.exec(select(Permission)).all()
    perms_by_code: Dict[str, Permission] = {p.code: p for p in existing_permissions}

    # Creamos permisos HR que falten.
    for code, description in hr_permissions.items():
        perm = perms_by_code.get(code)
        if perm is None:
            perm = Permission(code=code, description=description)
            session.add(perm)
            session.commit()
            session.refresh(perm)
            perms_by_code[code] = perm

    roles = {r.name: r for r in session.exec(select(Role)).all()}

    # Asignamos permisos HR a roles base.
    role_permission_map: Dict[str, Iterable[str]] = {
        "super_admin": hr_permissions.keys(),
        "tenant_admin": hr_permissions.keys(),
        "gerencia": ("hr:read", "hr:reports"),
    }

    for role_name, codes in role_permission_map.items():
        role = roles.get(role_name)
        if not role:
            continue

        existing_rps = session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id),
        ).all()
        existing_pairs = {
            (rp.role_id, rp.permission_id): rp for rp in existing_rps
        }

        for code in codes:
            perm = perms_by_code.get(code)
            if not perm:
                continue
            key = (role.id, perm.id)
            if key in existing_pairs:
                continue
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    session.commit()



def _ensure_erp_permissions(session: Session) -> None:
    """
    Crea (si no existen) los permisos del ERP y los asigna a roles base.
    """

    erp_permissions: Dict[str, str] = {
        "erp:read": "Ver proyectos, tareas e informes del ERP",
        "erp:track": "Iniciar/detener control de tiempo",
        "erp:manage": "Gestionar proyectos y tareas del ERP",
        "erp:reports:read": "Ver informes del ERP",
        "can_create_time_reports": "Crear informes de horas",
    }

    existing_permissions = session.exec(select(Permission)).all()
    perms_by_code: Dict[str, Permission] = {p.code: p for p in existing_permissions}

    for code, description in erp_permissions.items():
        perm = perms_by_code.get(code)
        if perm is None:
            perm = Permission(code=code, description=description)
            session.add(perm)
            session.commit()
            session.refresh(perm)
            perms_by_code[code] = perm

    roles = {r.name: r for r in session.exec(select(Role)).all()}

    role_permission_map: Dict[str, Iterable[str]] = {
        "super_admin": erp_permissions.keys(),
        "tenant_admin": erp_permissions.keys(),
        "gerencia": ("erp:read", "erp:reports:read"),
        "user": ("erp:read", "erp:track"),
    }

    for role_name, codes in role_permission_map.items():
        role = roles.get(role_name)
        if not role:
            continue

        existing_rps = session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id),
        ).all()
        existing_pairs = {
            (rp.role_id, rp.permission_id): rp for rp in existing_rps
        }

        for code in codes:
            perm = perms_by_code.get(code)
            if not perm:
                continue
            key = (role.id, perm.id)
            if key in existing_pairs:
                continue
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    session.commit()


def _ensure_contracts_permissions(session: Session) -> None:
    """
    Crea (si no existen) los permisos del módulo de contratos y roles asociados.
    """

    contract_permissions: Dict[str, str] = {
        "contracts:create": "Crear contratos del tenant",
        "contracts:read": "Ver contratos del tenant",
        "contracts:edit": "Editar contratos en borrador",
        "contracts:approve": "Aprobar contratos del tenant",
        "contracts:reject": "Rechazar contratos del tenant",
    }

    existing_permissions = session.exec(select(Permission)).all()
    perms_by_code: Dict[str, Permission] = {p.code: p for p in existing_permissions}

    for code, description in contract_permissions.items():
        perm = perms_by_code.get(code)
        if perm is None:
            perm = Permission(code=code, description=description)
            session.add(perm)
            session.commit()
            session.refresh(perm)
            perms_by_code[code] = perm

    roles = {r.name: r for r in session.exec(select(Role)).all()}

    required_roles = {
        "gerencia": "Gerencia",
    }
    for role_name, desc in required_roles.items():
        if role_name not in roles:
            role = Role(name=role_name, description=f"Rol contratos: {desc}")
            session.add(role)
            session.commit()
            session.refresh(role)
            roles[role_name] = role

    role_permission_map: Dict[str, Iterable[str]] = {
        "super_admin": contract_permissions.keys(),
        "tenant_admin": contract_permissions.keys(),
        "gerencia": ("contracts:read", "contracts:approve", "contracts:reject"),
        "user": ("contracts:read",),
    }

    for role_name, codes in role_permission_map.items():
        role = roles.get(role_name)
        if not role:
            continue
        existing_rps = session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id),
        ).all()
        existing_pairs = {
            (rp.role_id, rp.permission_id): rp for rp in existing_rps
        }
        for code in codes:
            perm = perms_by_code.get(code)
            if not perm:
                continue
            key = (role.id, perm.id)
            if key in existing_pairs:
                continue
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    session.commit()


def _prune_gerencia_permissions(session: Session) -> None:
    """
    El rol Gerencia no debe tener permisos de soporte, logs, herramientas ni ajustes de tenant.
    """

    role = session.exec(select(Role).where(Role.name == "gerencia")).one_or_none()
    if not role:
        return

    perms = session.exec(
        select(Permission).where(
            (Permission.code.like("tickets:%"))
            | (Permission.code.like("tools:%"))
            | (Permission.code.like("tenants:%"))
            | (Permission.code == "audit:read")
            | (Permission.code == "branding:manage")
            | (Permission.code == "users:create")
            | (Permission.code == "users:update")
            | (Permission.code == "users:delete")
        )
    ).all()
    disallowed_ids = {perm.id for perm in perms}
    if not disallowed_ids:
        return

    session.exec(
        delete(RolePermission).where(
            RolePermission.role_id == role.id,
            RolePermission.permission_id.in_(disallowed_ids),
        )
    )
    session.commit()

def run_seed() -> None:
    """
    Punto de entrada principal del proceso de seed RBAC.
    """

    with Session(db_session.engine) as session:
        permissions = _get_or_create_permissions(session)
        roles = _get_or_create_roles(session)
        _sync_role_permissions(session, roles, permissions)
        _ensure_super_admin_user(session, roles)
        _assign_tenant_admin_to_first_users(session, roles)
        _ensure_default_tenant_and_tools(session)
        _ensure_ticket_permissions(session)
        _ensure_hr_permissions(session)
        _ensure_erp_permissions(session)
        _ensure_contracts_permissions(session)
        _prune_gerencia_permissions(session)
        migrate_roles(session, apply_changes=True)


if __name__ == "__main__":
    run_seed()
