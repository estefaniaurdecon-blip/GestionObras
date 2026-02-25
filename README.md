# Plataforma SaaS Multi-Tenant (Monorepo)

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

Repositorio principal de una plataforma SaaS multi-tenant con backend, frontend
e infraestructura de despliegue.

## Componentes

- `backend-fastapi/`
  - API principal y modulos ERP.
  - Modelos SQLModel, servicios de negocio y seguridad.
- `frontend-react/`
  - Panel web desacoplado.
  - Ruteo, autenticacion y modulos de gestion.
- `infra/`
  - Docker Compose para desarrollo y produccion.
  - Configuracion de tunel Cloudflare.
- `documentacion/`
  - Arquitectura, seguridad, despliegue y catalogo unificado de endpoints.

## Puesta en marcha local

```bash
cd infra
docker compose up --build
```

Servicios:
- API: `http://<host>:8000`
- Frontend: `http://<host>:5173`

## Seed de roles y super admin

```bash
docker exec -it saas-backend-fastapi python -m app.core.seed_rbac
```

## Produccion (base)

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Para detalles de infraestructura y seguridad revisar:
- `documentacion/infraestructura.md`
- `documentacion/seguridad.md`
