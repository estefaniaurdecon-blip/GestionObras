from datetime import timedelta
from typing import List

from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.security import create_access_token
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User
from app.schemas.tool import ToolLaunchResponse, ToolRead


def get_tool_catalog(session: Session) -> List[ToolRead]:
    """
    Devuelve el catálogo global de herramientas.
    """

    tools = session.exec(select(Tool)).all()

    result: List[ToolRead] = []
    for t in tools:
        result.append(
            ToolRead(
                id=t.id,
                name=t.name,
                slug=t.slug,
                base_url=t.base_url,
                description=t.description,
            ),
        )

    return result


def get_tools_by_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
) -> List[ToolRead]:
    """
    Devuelve las herramientas habilitadas para un tenant concreto.
    """

    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise PermissionError(
            "No tienes permisos para consultar herramientas de este tenant",
        )

    tenant_tools = session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.is_enabled.is_(True),
        ),
    ).all()

    tool_ids = [tt.tool_id for tt in tenant_tools]
    if not tool_ids:
        return []

    tools = session.exec(select(Tool).where(Tool.id.in_(tool_ids))).all()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="tool.list",
        details=f"Listado de {len(tools)} herramientas para tenant_id={tenant_id}",
    )

    result: List[ToolRead] = []
    for t in tools:
        result.append(
            ToolRead(
                id=t.id,
                name=t.name,
                slug=t.slug,
                base_url=t.base_url,
                description=t.description,
            ),
        )

    return result


def launch_tool_for_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
    tool_id: int,
) -> ToolLaunchResponse:
    """
    Genera una URL firmada para lanzar una herramienta externa (SSO básico).
    """

    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise PermissionError(
            "No tienes permisos para lanzar herramientas en este tenant",
        )

    tenant_tool = session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool_id,
            TenantTool.is_enabled.is_(True),
        ),
    ).one_or_none()

    if not tenant_tool:
        raise LookupError("La herramienta no está habilitada para este tenant")

    tool = session.get(Tool, tool_id)
    if not tool:
        raise LookupError("Herramienta no encontrada")

    sso_token = create_access_token(
        subject=str(current_user.id),
        expires_delta=timedelta(minutes=5),
        extra_claims={
            "tenant_id": tenant_id,
            "tool_id": tool.id,
            "email": current_user.email,
        },
    )

    launch_url = f"{tool.base_url}?sso_token={sso_token}"

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="tool.launch",
        details=f"Lanzamiento de herramienta '{tool.slug}' para tenant_id={tenant_id}",
    )

    return ToolLaunchResponse(
        launch_url=launch_url,
        tool_id=tool.id,
        tool_name=tool.name,
    )


def set_tool_enabled_for_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
    tool_id: int,
    is_enabled: bool,
) -> None:
    """
    Habilita o deshabilita una herramienta para un tenant.
    """

    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise PermissionError(
            "No tienes permisos para configurar herramientas de este tenant",
        )

    tool = session.get(Tool, tool_id)
    if not tool:
        raise LookupError("Herramienta no encontrada")

    tenant_tool = session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool_id,
        ),
    ).one_or_none()

    if not tenant_tool:
        tenant_tool = TenantTool(
            tenant_id=tenant_id,
            tool_id=tool_id,
            is_enabled=is_enabled,
        )
        session.add(tenant_tool)
    else:
        tenant_tool.is_enabled = is_enabled
        session.add(tenant_tool)

    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="tool.configure",
        details=(
            f"Herramienta '{tool.slug}' "
            f"{'habilitada' if is_enabled else 'deshabilitada'} "
            f"para tenant_id={tenant_id}"
        ),
    )
