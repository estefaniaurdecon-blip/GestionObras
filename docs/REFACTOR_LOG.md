# REFACTOR_LOG

## Convenciones actuales
- Backend Python organizado en capas: `api -> services -> models/schemas -> db/storage/core`.
- API versionada bajo `/api/v1`; contratos publicos adicionales en `/public/*`.
- Naming backend: `snake_case` para modulos/funciones/campos.
- Frontend (`frontend-react`) y app (`construction-log`) con componentes `PascalCase`, hooks `useX`, tipos TS por modulo.
- En `construction-log` existe patron offline-first (`offline-db` + `outbox`) combinado con cliente API.
- Documentacion de endpoints centralizada en `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Convenciones propuestas (pendientes de validacion)
- `PENDIENTE`: estandar de formato Python unificado (`ruff format` o `black`) y reglas de lint estables en CI.
- `PENDIENTE`: estandar TS/React unificado entre `frontend-react` y `construction-log` (ESLint estricto + formateo consistente).
- `PENDIENTE`: politica de migraciones DB via Alembic (sin DDL ad-hoc en startup).
- `PENDIENTE`: regla de frontera en `construction-log`: solo `integrations/api/*` habla con backend; eliminar llamadas directas Supabase.
- `PENDIENTE`: cobertura minima por modulo refactorizado (tests unit/integration antes de merge).
- `PENDIENTE`: checklist de cambios de interfaz (actualizar `INTERFACES.md` y `ENDPOINTS_UNIFICADOS.md`).

## Lista inicial de problemas
1. `ALTO` Monolitos de logica en backend: `backend-fastapi/app/services/erp_service.py` (~92 KB), `backend-fastapi/app/api/v1/ai_runtime.py` (~78 KB), alta complejidad y riesgo de regresion.
2. `ALTO` Monolitos en `construction-log`: `src/components/WorkReportList.tsx` (~125 KB), `GenerateWorkReportPanel.tsx` (~99 KB), `useWorkReports.ts` (~54 KB).
3. `ALTO` Migracion parcial Supabase/API en `construction-log`: hay muchas referencias `supabase.*` en hooks/componentes pese al cliente marcado como deprecated.
4. `ALTO` Evolucion de esquema en runtime en `backend-fastapi/app/db/session.py` (muchos `ALTER TABLE` y backfills al arranque).
5. `ALTO` Variables sensibles en archivos `.env` versionados en repo (debe tratarse como riesgo de seguridad/operacion).
6. `MEDIO` CI actual (`.github/workflows/deploy.yml`) despliega sin gates de test/lint; usa `git reset --hard`.
7. `MEDIO` Endpoint definido pero no montado: `backend-fastapi/app/api/v1/albaran.py` no aparece en `app/api/v1/router.py`.
8. `MEDIO` Duplicidad de codigo/contexto (`frontend-react`, `apps/construction-log`, `referencias/saas_original_companero`), aumenta costo cognitivo.
9. `MEDIO` Ausencia de tests automatizados detectados para `construction-log` y `azure-functions/docint-proxy`.
10. `BAJO` Artefactos de ejecucion/log en repo (`*.log`, caches, `dist/`), ruido para mantenimiento.

## Plan por modulos (borrador)
| Orden | Modulo | Riesgo | Motivo |
|---|---|---|---|
| 1 | Seguridad/config repo | Alto | Remover secretos del control de versiones y definir politica de configuracion segura |
| 2 | Contratos e interfaces | Alto | Congelar contratos publicos antes de refactor; minimizar breaking changes |
| 3 | `construction-log` migracion API | Alto | Eliminar dependencia residual de Supabase y cerrar huecos de migracion |
| 4 | Persistencia backend (migraciones) | Alto | Sustituir DDL en startup por estrategia controlada de migraciones |
| 5 | Backend ERP/AI modularizacion | Medio | Separar servicios/routers grandes en submodulos por caso de uso |
| 6 | Frontend `construction-log` modularizacion UI | Medio | Descomponer componentes/hooks de gran tamaño y alta responsabilidad |
| 7 | Frontend dashboard `frontend-react` | Medio | Consolidar patrones API/hooks compartidos y reducir deuda en paginas grandes |
| 8 | CI/CD hardening | Medio | Agregar lint/test/build gates y smoke tests de despliegue |
| 9 | Limpieza estructural de repo | Bajo | Acordar alcance de `referencias/` y artefactos no fuente |

## Changelog de iteraciones
Plantilla para registrar cada iteracion de refactor.

```md
## Iteracion YYYY-MM-DD - <titulo corto>
- Objetivo:
- Alcance:
- Cambios realizados:
- Contratos impactados:
- Riesgos/mitigaciones:
- Tests ejecutados:
- Pendientes:
- Decision/es tomadas:
```

## Iteracion 2026-03-03 - Corte Supabase en hooks de partes
- Objetivo: quitar dependencias runtime a Supabase en flujo de maquinaria de alquiler y control de accesos.
- Alcance: `construction-log` (`useAccessControlSync`, `useWorkReportDownloads`, `rentalMachinerySource`, `integrations/api/client`).
- Cambios realizados:
  - `useAccessControlSync` migrado de consultas Supabase a API propia (`/api/v1/erp/access-control-reports` + `/api/v1/erp/rental-machinery`).
  - `rentalMachinerySource` migrado a `listRentalMachinery` en cliente API.
  - `useWorkReportDownloads` migrado a almacenamiento local temporal (`storage`) sin llamadas Supabase.
  - Se agrego `listRentalMachinery` y sus tipos en `integrations/api/client.ts`.
- Contratos impactados:
  - Sin cambios de contrato backend.
  - Se consume endpoint existente `GET /api/v1/erp/rental-machinery`.
- Riesgos/mitigaciones:
  - `useWorkReportDownloads` queda local-only hasta exponer endpoint backend para trazabilidad multiusuario.
  - Asignaciones de operador de maquinaria de alquiler no tienen endpoint dedicado; se usa fallback sin operador.
- Tests ejecutados:
  - `npm run tsc` en `apps/construction-log`.
  - `eslint` sobre archivos tocados.
- Pendientes:
  - Exponer endpoint backend para `work_report_downloads` y mover notificaciones de cambios de parte a API.
  - Exponer endpoint para asignaciones de operadores de maquinaria de alquiler si se requiere paridad completa.
- Decision/es tomadas:
  - Priorizar corte de dependencia Supabase en runtime aunque una parte de funcionalidad quede degradada temporalmente (sin tracking multiusuario remoto).

## Iteracion 2026-03-03 - FASE 1 / Modulo 1: reemplazo backend de cron Supabase
- Objetivo: retirar dependencia del cron Supabase para duplicacion diaria de partes con maquinaria de alquiler.
- Alcance: `backend-fastapi` (servicio, tarea Celery, endpoint interno, lock idempotente) + documentacion tecnica.
- Cambios realizados:
  - Nuevo servicio `work_report_autoclone_service.py` con `run_auto_duplicate_rental_machinery_for_date(...)`.
  - Nuevo lock DB `job_run_lock` (unique por `tenant_id`, `job_name`, `run_date`) para idempotencia diaria.
  - Nueva tarea Celery `app.workers.tasks.erp.auto_duplicate_rental_machinery_daily` y registro en Beat (06:00 Europe/Madrid).
  - Nuevo endpoint interno manual `POST /api/v1/internal/jobs/auto-duplicate-rental-machinery` (auth + permiso `erp:manage`, respuesta `202`).
  - Tests minimos: idempotencia/lock y endpoint interno (401/403/202).
  - `construction-log-supabase-local` documentado como DEPRECATED por retiro de Supabase.
- Contratos impactados:
  - Nuevo contrato interno: `POST /api/v1/internal/jobs/auto-duplicate-rental-machinery`.
  - Sin breaking changes en endpoints publicos existentes.
- Riesgos/mitigaciones:
  - Enumeracion multi-tenant depende de `tenant.is_active`; si cambia la estrategia de tenancy, debe ajustarse `_load_target_tenants`.
  - El cron legado en Supabase sigue existiendo hasta ejecutar PASO C (desactivacion explícita).
- Tests ejecutados:
  - `pytest backend-fastapi/tests/test_internal_jobs_autoclone.py`
- Pendientes:
  - PASO C: desactivar/retirar cron legacy de Supabase (`auto-duplicate-rental-machinery*`).
  - Continuar retiro de `apps/construction-log/construction-log-supabase-local` segun plan de migracion.
- Decision/es tomadas:
  - Migrar ejecucion periodica a backend FastAPI + Celery en lugar de endurecer Supabase.
