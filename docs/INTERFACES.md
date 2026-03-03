# INTERFACES

## Reglas
- No breaking changes sin aprobacion explicita.
- Cualquier cambio de rutas/contratos debe actualizar `documentacion/ENDPOINTS_UNIFICADOS.md`.
- Mantener compatibilidad de cabeceras multi-tenant (`X-Tenant-Id`) y autenticacion actual (cookie/Bearer) mientras no se acuerde cambio.
- Para contratos publicos (`/public/*`, proxy DocInt), preservar formato de request/response y codigos HTTP.

## API/Endpoints
Referencia completa vigente: `documentacion/ENDPOINTS_UNIFICADOS.md`.

### Contratos clave (alto impacto)
| Metodo | Ruta | Auth | Request (alto nivel) | Response (alto nivel) |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | Publico | `application/x-www-form-urlencoded` (`username`, `password`) | `LoginResponse` (`mfa_required`, token opcional) + cookie httpOnly |
| POST | `/api/v1/auth/mfa/verify` | Publico | JSON (`username`, `mfa_code`) | `MFAVerifyResponse` + cookie httpOnly |
| POST | `/api/v1/auth/logout` | Sesion activa | Sin body | `204 No Content`, borra cookies |
| GET | `/api/v1/users/me` | Bearer o cookie | Sin body | Usuario actual (`id`, `email`, `roles`, `tenant_id`, etc.) |
| GET/POST/PATCH/DELETE | `/api/v1/erp/projects*` | Requiere auth; superadmin con `X-Tenant-Id` | JSON params/body | Entidades proyecto ERP |
| GET/POST/PATCH/DELETE | `/api/v1/erp/work-reports*` | Requiere auth | JSON/query | Partes de trabajo |
| POST | `/api/v1/erp/work-reports/sync` | Requiere auth + `X-Tenant-Id` | `{ since, operations[], include_deleted, limit }` | `{ ack[], id_map?, server_changes? }` |
| GET/POST/PATCH/DELETE | `/api/v1/delivery-notes*` | Requiere auth | JSON/query | Albaranes internos/estado |
| GET/POST/PATCH/DELETE | `/api/v1/inventory-movements*` | Requiere auth | JSON/query | Movimientos e indicadores |
| POST | `/api/v1/updates/check` | Publico/app | JSON (`currentVersion`, `platform`) | Estado de update (`updateAvailable`, `version`, `downloadUrl`) |
| GET/POST/PATCH/DELETE | `/api/v1/invoices*` | Requiere auth; upload multipart | multipart/json | Facturas + metadatos OCR |
| GET/POST/PATCH | `/api/v1/contracts*` | Requiere auth | JSON/multipart segun endpoint | Contratos/ofertas/aprobaciones |
| POST | `/api/v1/internal/notifications` | Header `X-SAAS-API-KEY` | JSON (`email`, `title`, `body`, `reference`) | `201` sin payload |
| POST | `/api/v1/internal/jobs/auto-duplicate-rental-machinery` | Bearer + permiso `erp:manage` | JSON opcional (`run_date`, `tenant_id`, `force`) | `202` (`scheduled`, `job_id`, `task_name`) |
| POST | `/public/sign/{token}` | Publico | multipart opcional (firma) | Estado de firma de contrato |
| GET/POST | `/public/supplier-onboarding/{token}` | Publico | GET valida token; POST datos proveedor | Datos de proveedor onboarding |
| POST | `/api/v1/albaranes/process` (Azure proxy) | Bearer requerido | `multipart/form-data` con `file` | JSON normalizado DocInt (supplier/date/invoice/items/warnings) |

### Reglas de autenticacion y tenancy
- Auth backend: token Bearer `Authorization` o cookie httpOnly (`AUTH_COOKIE_NAME`), con MFA por email/TOTP en flujo de login.
- Multi-tenant:
  - Super admin: debe enviar `X-Tenant-Id` en operaciones de tenant.
  - Usuario tenant: se resuelve por `current_user.tenant_id` (o por subdominio en dependencias especificas).
- API interna:
  - `/api/v1/internal/notifications` exige `X-SAAS-API-KEY`.
  - `/api/v1/internal/jobs/auto-duplicate-rental-machinery` exige auth Bearer y permiso `erp:manage`.

### No encontrado
- No se encontraron contratos GraphQL/gRPC.

## CLI/Comandos
| Area | Comando | Ejemplo |
|---|---|---|
| Stack principal | Docker Compose | `cd infra && docker compose up --build` |
| Backend API | Uvicorn | `cd backend-fastapi && uvicorn app.main:app --reload` |
| Backend worker | Celery worker | `cd backend-fastapi && celery -A app.workers.celery_app.celery_app worker --loglevel=INFO` |
| Backend scheduler | Celery beat | `cd backend-fastapi && celery -A app.workers.celery_app.celery_app beat --loglevel=INFO` |
| Backend seed | RBAC seed | `cd backend-fastapi && python -m app.core.seed_rbac` |
| Backend tests | Pytest | `cd backend-fastapi && pytest` |
| Frontend dashboard | Dev server | `cd frontend-react && npm run dev` |
| Frontend dashboard | Lint/Test | `cd frontend-react && npm run lint && npm run test` |
| Construction app (wrapper) | Dev/build/lint | `cd apps/construction-log && npm run dev` |
| Construction app (directo) | Dev/build/lint | `cd apps/construction-log/construction-log-supabase-local && npm run dev` |
| Azure Function | Build/start | `cd azure-functions/docint-proxy && npm run build && npm run start` |
| Azure Function diag | Fixtures | `cd azure-functions/docint-proxy && node scripts/diagnose-fixtures.cjs` |

### No encontrado
- No se encontro un CLI unificado global del monorepo (tipo `make`, `just`, `taskfile`, `turbo`, `nx`).

## Eventos/Mensajeria
- Celery + Redis (backend):
  - Broker: `CELERY_BROKER_URL` / `REDIS_URL`.
  - Tareas incluidas: `app.workers.tasks.invoices`, `app.workers.tasks.health`, `app.workers.tasks.contracts`, `app.workers.tasks.erp`.
  - Beat:
    - `send_due_reminders_daily` (07:00 Europe/Madrid).
    - `auto_duplicate_rental_machinery_daily` (06:00 Europe/Madrid).
    - `ai_health_check` (cada 3 minutos).
  - Cron legacy Supabase `auto-duplicate-rental-machinery*` desactivado via migracion `20260303140004_disable_auto_duplicate_rental_machinery_cron.sql`.
- Señales internas en Redis:
  - Clave `ai:down` para circuit breaker de IA.
- Cola local offline (construction-log):
  - Tabla `outbox` en SQLite local con operaciones `create|update|delete` sobre `work_report`.

### No encontrado
- No se encontraron topics/colas de Kafka, RabbitMQ, SNS/SQS o Pub/Sub.

## Modelos/DTOs
| Entidad/DTO | Ubicacion | Campos clave (alto nivel) |
|---|---|---|
| Usuario | `backend-fastapi/app/models/user.py` + `schemas/user.py` | `id`, `email`, `full_name`, `is_active`, `is_super_admin`, `tenant_id`, `role_id` |
| Tenant | `models/tenant.py` + `schemas/tenant.py` | `id`, `name`, `subdomain`, `is_active` |
| Roles/Permisos | `models/role.py`, `permission.py`, `role_permission.py` | `role`, `permission.code`, relaciones RBAC |
| Proyecto ERP | `models/erp.py` + `schemas/erp.py` | `id`, `tenant_id`, `name`, `code`, `status`, fechas, presupuesto |
| Parte de trabajo | `models/erp.py` + `schemas/erp.py` | `id`, `project_id`, `date`, `status`, `payload`, trazas sync |
| Factura | `app/invoices/models.py` + `schemas.py` | `invoice_number`, `issue_date`, `due_date`, `status`, `project_id`, `file_path` |
| Contrato | `app/contracts/models.py` + `schemas.py` | `status`, `type`, proveedor, ofertas, documentos, firma |
| Ticket soporte | `models/ticket*.py` + `schemas/ticket.py` | `status`, `priority`, `created_by`, `assigned_to`, mensajes |
| Branding tenant | `models/tenant_branding.py` + `schemas/branding.py` | `logo_url`, `color_palette`, `department_emails` |
| Offline WorkReport | `apps/.../offline-db/types.ts` | `id`, `tenant_id`, `project_id`, `date`, `status`, `payload_json`, `sync_status` |
| Offline Outbox | `apps/.../offline-db/types.ts` | `id`, `entity`, `entity_id`, `op`, `payload_json`, `attempts`, `status` |
| DocInt parse response | `azure-functions/docint-proxy/src/schema.ts` | `docType`, `docSubtype`, `supplier`, `invoiceNumber`, `documentDate`, `items`, `warnings` |

## Configuracion externa
Solo nombres, sin valores.

### Backend FastAPI (`backend-fastapi/app/core/config.py`, `backend-fastapi/.env`)
- Core/DB: `ENV`, `DEBUG`, `DATABASE_URL`.
- JWT/Auth: `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `ALGORITHM`, `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`, `MFA_TRUST_COOKIE_NAME`, `MFA_TRUST_HOURS`.
- Bootstrap: `ALLOW_BOOTSTRAP_SUPERADMIN`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`.
- Multi-tenant/CORS: `PRIMARY_DOMAIN`, `FRONTEND_BASE_URL`, `FRONTEND_CORS_ORIGINS`.
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS`.
- Redis/Celery: `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_TIMEZONE`, `CELERY_VISIBILITY_TIMEOUT_SECONDS`, `CELERY_SOFT_TIME_LIMIT_SECONDS`, `CELERY_TIME_LIMIT_SECONDS`.
- IA: `OLLAMA_BASE_URL`, `OLLAMA_HEADERS_JSON`, `OLLAMA_OCR_MODEL`, `OLLAMA_JSON_MODEL`, `OLLAMA_TIMEOUT_SECS`, `OLLAMA_OCR_TIMEOUT_SECONDS`, `OLLAMA_JSON_TIMEOUT_SECONDS`, `AI_CIRCUIT_BREAKER_TTL_SECONDS`, `AI_HEALTH_CHECK_TIMEOUT_SECONDS`, `LOVABLE_API_KEY`.
- Facturas/contratos/storage: `INVOICES_STORAGE_PATH`, `CONTRACTS_STORAGE_PATH`, `INVOICE_MIN_TEXT_LENGTH`, `REMINDERS_DAILY_ENABLED`, `REMINDERS_DAILY_THRESHOLD`, `INVOICE_CREATED_EXTRA_RECIPIENTS`, `INVOICE_DUE_BASE_RECIPIENTS`, `INVOICE_DUE_EXTRA_RECIPIENTS_10`, `INVOICE_DUE_EXTRA_RECIPIENTS_5`, `SIGNATURE_REQUEST_TTL_HOURS`, `PUBLIC_API_BASE_URL`.
- Branding/media: `AVATARS_STORAGE_PATH`, `LOGOS_STORAGE_PATH`, `PROJECT_DOCS_STORAGE_PATH`, `WORK_REPORT_IMAGES_STORAGE_PATH`, `SHARED_FILES_STORAGE_PATH`, `DEFAULT_BRAND_ACCENT_COLOR`.
- Integraciones: `MOODLE_BASE_URL`, `MOODLE_TOKEN`, `SAAS_INTERNAL_API_KEY`.
- Updates app: `APP_UPDATES_CATALOG_JSON`, `APP_UPDATES_DISABLED_VERSIONS`.

### Frontend dashboard (`frontend-react/.env*`, `frontend-react/vite.config.ts`)
- `VITE_API_BASE_URL`
- `VITE_DEV_HOST`
- `VITE_API_PROXY_TARGET`

### Construction log app (`apps/.../.env*`, `vite.config.ts`)
- `VITE_API_BASE_URL`
- `VITE_NATIVE_API_BASE_URL`
- `VITE_DOCINT_BASE_URL`
- `VITE_NATIVE_DOCINT_BASE_URL`
- `VITE_DOCINT_PORT`
- `VITE_TENANT_ID`
- `VITE_DEV_TENANT_ID`
- `VITE_DESKTOP_ACCESS_URL`
- `VITE_ADMIN_SUPPORT_EMAIL`
- `VITE_APP_VERSION`
- `VITE_STARTUP_PERF`
- `VITE_API_PROXY_TARGET`

### Azure Functions DocInt (`azure-functions/docint-proxy/local.settings*.json`)
- `AzureWebJobsStorage`
- `FUNCTIONS_WORKER_RUNTIME`
- `DOCINT_ENDPOINT`
- `DOCINT_KEY`
- `DOCINT_API_VERSION`
- `DOCINT_MODEL_PRIMARY`
- `DOCINT_MODEL_FALLBACK`
- `DOCINT_LOCALE`
- `DOCINT_PAGES_LIMIT`
- `DOCINT_TIMEOUT_MS`
- `DOCINT_MAX_FILE_BYTES`
- `DOCINT_IS_F0`
- `API_BASE_URL`
- `API_AUTH_ME_PATH`
- `API_AUTH_ME_FALLBACK_PATH`
- `API_AUTH_TIMEOUT_MS`
