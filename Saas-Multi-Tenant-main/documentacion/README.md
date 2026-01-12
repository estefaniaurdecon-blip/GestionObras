# Plataforma SaaS Multi‑Tenant – Documentación Técnica

Este documento describe la arquitectura y los componentes principales de la plataforma SaaS multi‑tenant desplegada bajo el dominio `mavico.shop`.

La solución está diseñada para entornos B2B exigentes, con foco en:

- Multi‑tenancy por subdominio real.
- Seguridad fuerte (JWT, MFA TOTP, RBAC, auditoría).
- Integración de herramientas internas (ERP) y externas (Moodle u otras).
- Despliegue profesional con Docker y Cloudflare Tunnel.

## Índice

- Visión general de arquitectura (`arquitectura.md`)
- Backend SaaS (FastAPI) (`backend-fastapi.md`)
- Módulo ERP (FastAPI) (`backend-fastapi.md`)
- Frontend (React) (`frontend-react.md`)
- Infraestructura y despliegue (`infraestructura.md`)
- Seguridad y cumplimiento (`seguridad.md`)

Para cualquier cambio funcional o de arquitectura, se recomienda actualizar la sección correspondiente en estos documentos.
