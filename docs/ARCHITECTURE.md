# ARCHITECTURE

## AS-IS
### Vista general
- Clientes:
  - `frontend-react` (dashboard admin/ERP, React + Chakra + TanStack).
  - `apps/construction-log/construction-log-supabase-local` (web/Android/Electron, offline-first).
- Backend core:
  - `backend-fastapi` expone `/api/v1` y `/public`.
  - Capa API (`app/api/v1`) -> capa servicio (`app/services`, `app/invoices`, `app/contracts`) -> capa datos (`app/models`, `app/db`).
- Procesamiento asinc:
  - Celery worker/beat (`app/workers`) con Redis broker.
- OCR albaranes:
  - `azure-functions/docint-proxy` valida token contra backend y consume Azure Document Intelligence.
- Datos y almacenamiento:
  - PostgreSQL para backend.
  - Redis para colas/circuit-breaker.
  - Archivos locales backend (`/data/invoices`, `/data/contracts`, logos/avatares/docs).
  - SQLite local (`sql.js`) en `construction-log` para modo offline.
- Orquestacion:
  - Docker Compose en `infra/` (db, redis, backend, workers, frontend).
  - Cloudflare tunnel configurado en `infra/cloudflared/config.yml`.

### Dependencias observadas
- `frontend-react` consume backend via `src/api/*` (axios `apiClient`).
- `construction-log` consume backend via `src/integrations/api/client.ts` y mantiene restos de migracion Supabase en varios modulos.
- FastAPI routers llaman mayormente a `app/services/*`; modulos `invoices` y `contracts` tienen subdominio propio.
- `init_db()` crea tablas y aplica alteraciones ad-hoc en cada arranque.
- Celery tasks consumen servicios de facturas/contratos/IA y usan Redis para señalizacion.

## TO-BE (propuesta)
Objetivo: evolucion incremental sin reescritura total.

### Arquitectura objetivo minima
- Mantener monorepo, pero con fronteras explicitas:
  - `backend-fastapi`: `api` (IO HTTP) -> `application services` (casos de uso) -> `domain/persistence`.
  - `construction-log`: `ui` -> `hooks` -> `gateways` (`integrations/api`, `offline-db`), sin acceso directo a proveedores legacy.
  - `frontend-react`: `pages/components` -> `hooks` -> `api`.
- Sustituir migraciones runtime por pipeline de migraciones controladas (Alembic/SQL scripts versionados y ejecutados por entorno).
- Formalizar contratos compartidos:
  - OpenAPI + docs unificadas como fuente unica.
  - DTOs clave versionados y testeados (auth, work-report sync, invoices, contracts).
- Estabilizar plano asinc:
  - Mantener Celery, pero con contratos de tarea claros y observabilidad basica (reintentos, errores, idempotencia).
  - Cron legado de Supabase sustituido por tarea backend `auto_duplicate_rental_machinery_daily` (Beat, Europe/Madrid) con lock DB por tenant/fecha.
- Completar corte Supabase en `construction-log`:
  - Eliminar llamadas residuales `supabase.*` o encapsular temporalmente en un adapter de compatibilidad unico.
  - Marcar `apps/construction-log/construction-log-supabase-local` como DEPRECATED hasta su retirada completa.

## Principios
- Boundary first: cada capa/modulo depende solo de la capa inferior acordada.
- API estable: cambios en contratos publicos requieren versionado o aprobacion previa.
- Single source of truth:
  - Endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.
  - Contexto refactor: docs en `docs/`.
- Infra declarativa y reproducible: arranque local/prod desde Compose y variables externas.
- Seguridad por defecto: secretos fuera de repo, validaciones de auth y tenancy explicitas.
- Refactor incremental con pruebas: modularizar por slices pequenos, no big-bang.

## Decisiones pendientes
1. Alcance de convergencia entre `frontend-react` y `construction-log`: mantener dos frontends o extraer librerias compartidas.
2. Plan definitivo de deprecacion Supabase en `construction-log` (modulos, fechas, rollback).
3. Estrategia oficial de migraciones DB (Alembic vs SQL manual versionado) y politica de cambios en produccion.
4. Contrato de autenticacion para clientes moviles/desktop: prioridad cookie httpOnly vs bearer persistido.
5. Politica multi-tenant unificada: `X-Tenant-Id` obligatorio en que casos y fallback por subdominio.
6. Requisitos minimos de calidad en CI (lint/test/build/smoke) antes de permitir despliegue.
7. Tratamiento de `referencias/saas_original_companero`: archivado, submodulo o exclusion del arbol activo.
