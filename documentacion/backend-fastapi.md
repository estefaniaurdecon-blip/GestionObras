# Backend FastAPI

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Rol

Backend principal de la plataforma SaaS:

- Gestion de tenants, usuarios y roles.
- Autenticacion JWT + MFA.
- RBAC y auditoria.
- Modulos ERP (proyectos, tiempos, partes, contratos, etc.).

## Estructura

- `backend-fastapi/app/main.py`
- `backend-fastapi/app/api/*`
- `backend-fastapi/app/services/*`
- `backend-fastapi/app/models/*`
- `backend-fastapi/app/core/*`

## Regla documental

- Este documento no lista rutas concretas.
- Las rutas y su estado (activo/pendiente/migracion) se mantienen solo en `documentacion/ENDPOINTS_UNIFICADOS.md`.
