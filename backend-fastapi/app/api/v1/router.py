from fastapi import APIRouter

from . import (
    attachments,
    ai_runtime,
    ai_chat,
    audit,
    auth,
    dashboard,
    delivery_notes,
    erp,
    external_collaborations,
    branding,
    health,
    hr,
    invitations,
    inventory_movements,
    internal,
    contracts,
    invoices,
    notifications,
    tenants,
    tickets,
    tools,
    updates,
    users,
    summary,
    simulations,
)


api_router = APIRouter()

# Rutas públicas / semi públicas
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(branding.router, prefix="/branding", tags=["branding"])
api_router.include_router(updates.router, prefix="/updates", tags=["updates"])
api_router.include_router(ai_chat.router, prefix="/ai", tags=["ai"])
api_router.include_router(ai_runtime.router, prefix="/ai", tags=["ai"])
api_router.include_router(
    delivery_notes.router,
    prefix="/delivery-notes",
    tags=["delivery-notes"],
)
api_router.include_router(
    inventory_movements.router,
    prefix="/inventory-movements",
    tags=["inventory-movements"],
)
api_router.include_router(
    attachments.router,
    prefix="",
    tags=["attachments"],
)

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
    contracts.router,
    prefix="/contracts",
    tags=["contracts"],
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
