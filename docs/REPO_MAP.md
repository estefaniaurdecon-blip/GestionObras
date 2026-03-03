# REPO_MAP

## Resumen (10 lineas maximo)
Este repo es un monorepo SaaS multi-tenant con backend FastAPI, frontend web React, app de partes de obra (web/Android/Electron) y un proxy Azure Functions para OCR de albaranes.  
El backend expone API versionada en `/api/v1`, auth JWT+cookie con MFA y modulos ERP (proyectos, partes, RRHH, tickets, contratos, facturas, inventario).  
`frontend-react/` es el dashboard administrativo/ERP desacoplado.  
`apps/construction-log/construction-log-supabase-local/` es la app operativa de obra, con modo offline (SQLite en navegador/dispositivo) y sincronizacion por outbox.  
`azure-functions/docint-proxy/` procesa `multipart/form-data`, valida token contra backend y llama a Azure Document Intelligence.  
`infra/` contiene Docker Compose para levantar DB, Redis, backend, workers y frontend, con override de produccion y configuracion de Cloudflare Tunnel.  
`documentacion/ENDPOINTS_UNIFICADOS.md` es la referencia central de rutas API detectadas (138 endpoints backend + proxy DocInt).  
Hay evidencia de migracion parcial desde Supabase hacia API propia en la app de `construction-log`.  
Hay tests backend y frontend web; no se encontraron tests automatizados para `construction-log` ni para `azure-functions/docint-proxy`.

## Arbol alto nivel
- `apps/`: apps de negocio; actualmente `construction-log` (wrapper + app principal).
- `azure-functions/`: funciones serverless; actualmente `docint-proxy`.
- `backend-fastapi/`: API principal, modelos SQLModel, servicios y workers Celery.
- `db/`: scripts SQL de migraciones/seed para datos base.
- `documentacion/`: documentacion funcional/infra y catalogo unificado de endpoints.
- `frontend-react/`: dashboard React (Vite + TanStack Router + React Query + Chakra).
- `infra/`: orquestacion Docker Compose y configuracion cloudflared.
- `referencias/`: copia de referencia (`saas_original_companero`), no runtime principal.
- `node_modules/`: dependencias Node instaladas en raiz (artefacto de desarrollo).

## Entrypoints
- `backend-fastapi/app/main.py`: app FastAPI principal (`uvicorn app.main:app --reload` o Docker `CMD uvicorn ...`).
- `backend-fastapi/app/workers/celery_app.py`: arranque de workers (`celery -A app.workers.celery_app.celery_app worker`) y beat.
- `frontend-react/src/main.tsx`: entrypoint React dashboard (`npm run dev` en `frontend-react/`).
- `apps/construction-log/construction-log-supabase-local/src/main.tsx`: entrypoint app construction log (`npm run dev` en wrapper/app).
- `apps/construction-log/construction-log-supabase-local/electron/main.js`: proceso principal Electron para desktop build/runtime.
- `azure-functions/docint-proxy/src/index.ts`: registro de function HTTP `processAlbaran` (`npm run build && func start`).
- `infra/docker-compose.yml`: arranque integrado local del stack principal (`docker compose up --build`).
- `apps/construction-log/construction-log-supabase-local/docker-compose.yml`: stack Supabase local + app.
- `.github/workflows/deploy.yml`: pipeline de despliegue (self-hosted runner, Docker compose, seed RBAC).

## Modulos principales
| Modulo | Ruta | Responsabilidad | Entradas/Salidas | Depende de | Usado por |
|---|---|---|---|---|---|
| API FastAPI v1 | `backend-fastapi/app/api/v1/` | Rutas HTTP versionadas y validacion de request/response | HTTP JSON/form-data + headers (`Authorization`, `X-Tenant-Id`) | `app/services`, `app/invoices`, `app/contracts`, deps/auth | `frontend-react`, `construction-log`, integraciones internas |
| Servicios de dominio | `backend-fastapi/app/services/` | Reglas de negocio (auth, ERP, HR, tickets, branding, etc.) | DTOs de `schemas`, entidades SQLModel | `app/models`, `app/core`, `app/storage` | Routers API |
| Persistencia backend | `backend-fastapi/app/models/`, `app/db/` | Modelos SQLModel, sesion/engine, init DB | SQLModel Session/queries | PostgreSQL, SQLAlchemy/SQLModel | Servicios + startup |
| Facturas | `backend-fastapi/app/invoices/` | CRUD facturas, guardado de archivo, reprocess, notificaciones | Upload de archivo + JSON | `app/storage/local.py`, Celery tasks | API `/api/v1/invoices/*` |
| Contratos | `backend-fastapi/app/contracts/` | Flujo de contratos/ofertas/aprobaciones/firma publica | JSON + uploads + tokens publicos | storage local, email, modelos contratos | API `/api/v1/contracts/*`, `/public/*` |
| Jobs asinc | `backend-fastapi/app/workers/` | Extraccion OCR/IA de facturas, recordatorios, health AI | Tareas Celery/Redis | Redis, Celery, servicios backend | Invoices/Contracts/API startup |
| Dashboard web | `frontend-react/src/` | UI admin/ERP multi-modulo con rutas TanStack | HTTP a backend via `apiClient` | Backend API, React Query, Chakra | Usuarios web admin |
| Construction Log app | `apps/construction-log/construction-log-supabase-local/src/` | UI operativa de obra, auth MFA, partes, inventario, OCR albaranes | API REST + almacenamiento local + capacidades nativas | `integrations/api`, `offline-db`, plugins/Capacitor, (migracion Supabase) | Usuarios obra (web/android/electron) |
| Offline sync | `apps/.../src/offline-db`, `src/sync/syncService.ts` | Base local SQLite + outbox + pull/push incremental | tablas `work_reports/outbox/local_meta`, endpoint `/api/v1/erp/work-reports/sync` | sql.js, API backend | Construction Log app |
| DocInt proxy | `azure-functions/docint-proxy/src/` | Proxy a Azure DocInt con normalizacion de salida y validacion token backend | `POST multipart file`, respuesta JSON normalizada | Azure Functions SDK, DocInt API, backend `/users/me` | Construction Log (scan albaran) |
| Infra despliegue | `infra/` | Compose local/prod, red y volumentria, tunel Cloudflare | docker compose, env files | Docker, Postgres, Redis, contenedores app | Desarrollo y despliegue |

## Flujos principales
- Login web/app: UI -> `/api/v1/auth/login` (form) -> posible `/api/v1/auth/mfa/verify` -> cookie/token -> `/api/v1/users/me`.
- Partes offline-first: UI guarda en `offline-db` (`work_reports` + `outbox`) -> `syncNow()` -> `/api/v1/erp/work-reports/sync` -> ack + `server_changes` -> reconciliacion local.
- Facturas: upload (`/api/v1/invoices`) -> guardado disco local backend -> encolado `extract_invoice` (Celery) -> OCR/IA + estado factura + notificaciones.
- Contratos: CRUD contrato/ofertas -> generacion docs/aprobaciones -> notificaciones correo -> firma publica `/public/sign/{token}`.
- Escaneo albaran: app -> Azure Function `/api/v1/albaranes/process` -> valida bearer contra backend -> DocInt -> parseo -> JSON para revision en UI.
- Dashboard ERP: `frontend-react` -> endpoints `/api/v1/erp/*`, `/api/v1/hr/*`, `/api/v1/tickets/*`, `/api/v1/contracts/*`, `/api/v1/invoices/*`.

## Riesgos detectados
- Archivos monoliticos grandes (ej.: `backend-fastapi/app/services/erp_service.py`, `backend-fastapi/app/api/v1/ai_runtime.py`, `apps/.../src/components/WorkReportList.tsx`, `GenerateWorkReportPanel.tsx`).
- Migracion incompleta de Supabase en `construction-log`: hay muchas referencias a `supabase.*` pese al cliente marcado como deprecated.
- `backend-fastapi/app/db/session.py` ejecuta DDL/migraciones ad-hoc al startup; alto riesgo de deriva de esquema entre entornos.
- Se detecto `backend-fastapi/app/api/v1/albaran.py` con endpoints definidos pero no incluido en `app/api/v1/router.py`.
- Pipeline `.github/workflows/deploy.yml` despliega directo con `git reset --hard` y no ejecuta test/lint.
- No se encontraron tests automatizados en `apps/construction-log/...` ni en `azure-functions/docint-proxy`.
- Duplicidad/deriva documental y de codigo: `frontend-react/` + `apps/construction-log/` + `referencias/saas_original_companero/`.
- Archivos de logs/build (`*.log`, `dist/`, caches) presentes en el repo, aumentando ruido operativo.
