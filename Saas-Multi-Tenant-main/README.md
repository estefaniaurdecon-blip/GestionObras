# Plataforma SaaS Multi‑Tenant – Monorepo

Este repositorio contiene la implementación de una plataforma SaaS multi‑tenant profesional bajo el dominio `mavico.shop`, compuesta por:

- Backend SaaS (FastAPI) – núcleo de negocio y multi‑tenant.
- Módulo ERP (FastAPI) – gestión operativa interna.
- Frontend (React) – dashboard desacoplado.
- Infraestructura (Docker + Cloudflare Tunnel) – despliegue y dominios.

## Estructura

- `backend-fastapi/` – API SaaS:
  - `app/models/` – modelos de base de datos (SQLModel).
  - `app/schemas/` – DTOs de entrada/salida de la API.
  - `app/services/` – lógica de dominio (auth, tenants, users, tools).
  - `app/api/v1/` – rutas HTTP (finas) que usan los servicios.
  - `app/core/` – configuración, seguridad, auditoría, seed de RBAC.

- `frontend-react/` – frontend:
  - `src/api/` – cliente HTTP y módulos de API.
  - `src/components/` – layout y componentes reutilizables (ToolGrid, etc.).
  - `src/pages/` – páginas (Login, MFA, Dashboard).

- `infra/` – infraestructura:
  - `docker-compose.yml` – entorno de desarrollo.
  - `docker-compose.prod.yml` – override de producción.
  - `cloudflared/config.yml` – configuración del túnel Cloudflare.

- `documentacion/` – documentación técnica detallada (arquitectura, seguridad, etc.).

## Puesta en marcha rápida

### Desarrollo local

```bash
cd infra
docker compose up --build
```

Servicios expuestos en localhost:
- FastAPI: `http://localhost:8000/api/v1/health/`
- Frontend: `http://localhost:5173/`

### Seed de RBAC y Super Admin

```bash
docker exec -it saas-backend-fastapi python -m app.core.seed_rbac
```

Crea permisos/roles base y garantiza un Super Admin:
- Email: `dios@cortecelestial.god`
- Contraseña inicial: `temporal`

### Producción (esqueleto)

1. Configurar el dominio `mavico.shop` en Cloudflare y crear túnel `saas-mavico`.
2. Colocar el JSON de credenciales del túnel en `infra/cloudflared/saas-mavico.json`.
3. Desplegar:

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Más detalles en `documentacion/infraestructura.md` y `documentacion/seguridad.md`.
