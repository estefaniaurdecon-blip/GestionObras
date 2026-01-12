from datetime import datetime, timedelta

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User
from app.schemas.dashboard import DashboardSummary


def get_dashboard_summary(session: Session, *, current_user: User) -> DashboardSummary:
    """
    Calcula métricas básicas para el dashboard.

    - Tenants activos (solo visible para super admin).
    - Usuarios activos (del sistema o del tenant).
    - Herramientas activas para el tenant actual.
    - Horas registradas hoy y en la última semana (placeholder: 0.0 de momento).
    """

    # Tenants activos
    if current_user.is_super_admin:
        tenants_activos = session.exec(
            select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True)),
        ).one()
    else:
        tenants_activos = 1 if current_user.tenant_id else 0

    # Usuarios activos
    if current_user.is_super_admin:
        usuarios_activos = session.exec(
            select(func.count()).select_from(User).where(User.is_active.is_(True)),
        ).one()
    else:
        usuarios_activos = session.exec(
            select(func.count())
            .select_from(User)
            .where(
                User.is_active.is_(True),
                User.tenant_id == current_user.tenant_id,
            ),
        ).one()

    # Herramientas activas para el tenant actual
    if current_user.tenant_id:
        herramientas_activas = session.exec(
            select(func.count())
            .select_from(TenantTool)
            .where(
                TenantTool.tenant_id == current_user.tenant_id,
                TenantTool.is_enabled.is_(True),
            ),
        ).one()
    else:
        herramientas_activas = 0

    # Horas desde ERP: por simplicidad, lo dejamos a 0.0 de momento.
    horas_hoy = 0.0
    horas_ultima_semana = 0.0

    # Métricas básicas de soporte (tickets)
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    week_start = today_start - timedelta(days=7)

    ticket_scope = select(Ticket)
    if not current_user.is_super_admin and current_user.tenant_id:
        ticket_scope = ticket_scope.where(Ticket.tenant_id == current_user.tenant_id)

    base_query = ticket_scope.subquery()

    tickets_abiertos = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.status == TicketStatus.OPEN)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    tickets_en_progreso = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.status == TicketStatus.IN_PROGRESS)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    tickets_resueltos_hoy = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.resolved_at.is_not(None))
        .where(Ticket.resolved_at >= today_start)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    tickets_cerrados_ultima_semana = session.exec(
        select(func.count())
        .select_from(Ticket)
        .where(Ticket.closed_at.is_not(None))
        .where(Ticket.closed_at >= week_start)
        .where(Ticket.id.in_(select(base_query.c.id)))
    ).one()

    return DashboardSummary(
        tenants_activos=int(tenants_activos or 0),
        usuarios_activos=int(usuarios_activos or 0),
        herramientas_activas=int(herramientas_activas or 0),
        horas_hoy=float(horas_hoy),
        horas_ultima_semana=float(horas_ultima_semana),
        tickets_abiertos=int(tickets_abiertos or 0),
        tickets_en_progreso=int(tickets_en_progreso or 0),
        tickets_resueltos_hoy=int(tickets_resueltos_hoy or 0),
        tickets_cerrados_ultima_semana=int(tickets_cerrados_ultima_semana or 0),
    )

