from fastapi import APIRouter

from . import (
    audit,
    auth,
    dashboard,
    erp,
    external_collaborations,
    branding,
    health,
    hr,
    invitations,
    internal,
    invoices,
    notifications,
    tenants,
    tickets,
    tools,
    users,
    summary,
    simulations,
)


api_router = APIRouter()

# Rutas públicas / semi públicas
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(branding.router, prefix="/branding", tags=["branding"])

# Rutas protegidas
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(tools.router, prefix="/tools", tags=["tools"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(erp.router, prefix="/erp", tags=["erp"])
api_router.include_router(
    external_collaborations.router,
    prefix="/erp",
    tags=["erp"],
)
api_router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
api_router.include_router(hr.router, prefix="/hr", tags=["hr"])
api_router.include_router(
    invitations.router,
    prefix="/invitations",
    tags=["invitations"],
)
api_router.include_router(
    notifications.router,
    prefix="/notifications",
    tags=["notifications"],
)
api_router.include_router(
    invoices.router,
    prefix="/invoices",
    tags=["invoices"],
)
api_router.include_router(
    internal.router,
    prefix="/internal",
    tags=["internal"],
)
api_router.include_router(
    summary.router,
    prefix="/erp",
    tags=["erp"],
)
api_router.include_router(
    simulations.router,
    prefix="/erp",
    tags=["erp"],
)
