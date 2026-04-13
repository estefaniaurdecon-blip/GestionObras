# SaaS Multi-Tenant Monorepo

Repositorio principal de una plataforma SaaS multi-tenant orientada a operacion,
ERP, mensajeria, RRHH, facturacion, contratos y partes de obra.

## Estado actual del arbol

El arbol de trabajo refleja una refactorizacion activa en tres frentes:

- Frontend `apps/construction-log`: division de componentes grandes en modulos y hooks mas pequeños.
- Backend `backend-fastapi`: limpieza de deuda temporal, refuerzo de ERP y sustitucion de `datetime.utcnow()`.
- Azure Functions `azure-functions/docint-proxy`: extraccion de utilidades puras y primera base de tests.

## Estructura

- `apps/construction-log/`
  Wrapper de desarrollo del frontend principal.
- `apps/construction-log/construction-log-supabase-local/`
  App React/Vite usada en desarrollo diario.
- `backend-fastapi/`
  API principal multi-tenant con FastAPI, SQLModel, Celery y RBAC.
- `azure-functions/docint-proxy/`
  Proxy HTTP para Azure AI Document Intelligence.
- `infra/`
  Docker Compose, variables de entorno y despliegue base.
- `db/`
  Scripts y artefactos de base de datos.

## Cambios relevantes ya presentes

- Frontend:
  refactor en progreso de `DashboardToolsTabContents`, `EconomicManagement`,
  `GenerateWorkReportPanel`, `WorkManagement`, `WorkReportList`,
  `WorkPostventasSection` y `WorkRepasosSection`.
- Frontend:
  nuevas carpetas modulares bajo `src/components/` como
  `economic-management/`, `work-management/`, `work-postventas/`,
  `work-repasos/` y `tools-panel/parts-tab/`.
- Frontend:
  nuevos hooks como `useScanReviewState`, `useWorkReportExportActions`,
  `useWorkReportFormHandlers`, `useWorkReportGrouping` y
  `useWorkReportListFilters`.
- Backend:
  fix del duplicado de `department_id` en ERP y cobertura de tests para alta y
  actualizacion de proyectos.
- Backend:
  helper comun `app/core/datetime.py` para reemplazar `datetime.utcnow()` sin
  romper el contrato actual de fechas naive en UTC.
- Backend:
  capa JWT propia para `HS256` en `app/core/security.py`; ya no dependemos de
  `python-jose`.
- Azure Functions:
  `processAlbaran` extrae utilidades testables y ahora dispone de `npm test`.
- Infra:
  `OLLAMA_BASE_URL` es obligatorio en `infra/docker-compose.prod.yml`.
- Repo hygiene:
  `.gitignore` cubre mejor secretos locales y artefactos temporales.

## Puesta en marcha rapida

### Backend

```bash
cd backend-fastapi
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd apps/construction-log
npm run install:app
npm run dev
```

URL local por defecto: `http://localhost:8080`

### Azure Functions

```bash
cd azure-functions/docint-proxy
npm install
npm run build
func start
```

## Checks utiles

- Backend:
  `python -m pytest`
- Frontend wrapper:
  `npm run build`
- Frontend app:
  `npm run lint:changed`
- Azure Functions:
  `npm test`

## Configuracion y secretos

- Usa solo archivos `*.example` como plantilla.
- `azure-functions/docint-proxy/local.settings.json` debe permanecer fuera de Git.
- En produccion define `OLLAMA_BASE_URL` de forma explicita.
- Si trabajas con claves rotadas, actualiza solo archivos ignorados.

## Documentacion relacionada

- [backend-fastapi/README.md](backend-fastapi/README.md)
- [azure-functions/docint-proxy/README.md](azure-functions/docint-proxy/README.md)
- [apps/construction-log/README.md](apps/construction-log/README.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
