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
1. `ALTO` Monolitos de logica en backend: `backend-fastapi/app/services/erp_service.py` (~93.5 KB), `backend-fastapi/app/api/v1/ai_runtime.py` (~76.4 KB), alta complejidad y riesgo de regresion.
2. `ALTO` Monolitos en `construction-log`: `src/components/DashboardToolsTabContents.tsx` (~113 KB, 2698 lineas), `WorkReportList.tsx` (~122.6 KB, 2496 lineas), `GenerateWorkReportPanel.tsx` (~98.8 KB, 2389 lineas), `useWorkReports.ts` (~53.6 KB, 1301 lineas).
3. `ALTO` Ruptura de frontera UI->hooks->gateways en `construction-log`: `DashboardToolsTabContents.tsx` sigue mezclando UI + reglas de dominio; a 2026-03-05 ya se extrajeron importacion, infraestructura/dominio de exportacion a `services/*`, estado/reglas de calendario-periodos e imagenes de exportacion a hooks (`useWorkReportExportCalendar`, `useWorkReportExportPeriodSelection`, `useWorkReportExportImageSelection`) y el ensamblado de `ExportWorkReport` en `workReportExportDomain`.
4. `ALTO` Migracion parcial Supabase/API en `construction-log`: se detectan 23 referencias `supabase.*` en 13 archivos de `src` (hooks/componentes/utils) pese al cliente marcado como deprecated; en `useWorkReports.ts` ya no hay llamadas directas y se encapsularon en `services/workReportsSupabaseGateway.ts`.
5. `ALTO` Cliente API monolitico en `construction-log`: `src/integrations/api/client.ts` (~53 KB, 1690 lineas) concentra demasiados contratos y mapeos en un solo modulo.
6. `ALTO` Evolucion de esquema en runtime en `backend-fastapi/app/db/session.py` (muchos `ALTER TABLE` y backfills al arranque).
7. `ALTO` Variables sensibles en archivos `.env` versionados en repo (debe tratarse como riesgo de seguridad/operacion).
8. `MEDIO` Monolitos en `frontend-react`: `TimeControlPage.tsx` (1800 lineas), `ContractsModule.tsx` (1831 lineas), `ErpTasksPage.tsx` (1504 lineas), `HrPage.tsx` (1501 lineas).
9. `MEDIO` CI actual (`.github/workflows/deploy.yml`) despliega sin gates de test/lint; usa `git reset --hard`.
10. `MEDIO` Endpoint definido pero no montado: `backend-fastapi/app/api/v1/albaran.py` no aparece en `app/api/v1/router.py`.
11. `MEDIO` Duplicidad de codigo/contexto (`frontend-react`, `apps/construction-log`, `referencias/saas_original_companero`), aumenta costo cognitivo.
12. `MEDIO` Cobertura de tests insuficiente fuera de backend: `construction-log` muestra tests puntuales (`tests/reportsAnalysisWorkGrouping.test.ts`, `tests/workReportImportService.test.ts`, `tests/workReportExportDomain.test.ts`, `tests/workReportExportPeriodSelection.test.ts`) pero sigue sin cobertura amplia de flujos criticos; `azure-functions/docint-proxy` no expone tests fuente en `src`.
13. `BAJO` Artefactos de ejecucion/log en repo (`*.log`, caches, `dist/`), ruido para mantenimiento.

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

## Iteracion 2026-03-05 - Inventario de nuevos hotspots de refactor
- Objetivo: actualizar el backlog de refactor con evidencia reciente antes de iniciar la siguiente fase.
- Alcance: analisis estatico de `backend-fastapi/app`, `frontend-react/src`, `apps/construction-log/construction-log-supabase-local/src`, `azure-functions/docint-proxy/src` y actualizacion de docs en `docs/`.
- Cambios realizados:
  - Se agrego `DashboardToolsTabContents.tsx` como hotspot principal (3457 lineas) y se registraron sus responsabilidades mezcladas (UI + import/export + persistencia offline).
  - Se agrego `integrations/api/client.ts` como candidato de descomposicion por tamano/acoplamiento (1690 lineas).
  - Se agregaron hotspots de `frontend-react` (paginas/componentes >1500 lineas) para plan de modularizacion.
  - Se actualizo el estado de migracion Supabase/API con conteo actual (23 hits `supabase.*` en 13 archivos de `src`).
  - Se corrigio el estado de tests: existe 1 test en `construction-log`; en `docint-proxy` no se detectan tests fuente en `src`.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Inventario documental sin cambios runtime; el riesgo operativo es bajo.
  - Sin modularizacion inmediata, el costo de cambio seguira subiendo en los hotspots detectados.
- Tests ejecutados:
  - Barrido estatico de referencias `supabase.*` y de tamano/lineas por archivo.
  - Verificacion de presencia de tests por modulo (excluyendo `node_modules`, `dist` y `venv`).
- Pendientes:
  - Priorizar descomposicion de `DashboardToolsTabContents.tsx` y `integrations/api/client.ts` en la siguiente iteracion (estado actual: importacion y IO de exportacion ya extraidos, pero el componente sigue siendo monolitico).
  - Definir estrategia de corte final de referencias Supabase restantes.
- Decision/es tomadas:
  - Mantener el plan incremental y usar este inventario como baseline de seguimiento para la siguiente ronda de refactor.

## Iteracion 2026-03-05 - DashboardTools Slice 1 y 2 (import + export IO)
- Objetivo: reducir acoplamiento de `DashboardToolsTabContents.tsx` moviendo casos de uso fuera del componente.
- Alcance: `construction-log` (`src/components/DashboardToolsTabContents.tsx`, `src/services/workReportImportService.ts`, `src/services/workReportExportInfrastructure.ts`, `tests/workReportImportService.test.ts`).
- Cambios realizados:
  - Slice 1: extraccion del flujo de importacion de partes a `workReportImportService` (parseo, validacion, deteccion de conflictos, politicas `overwrite|renumber`, aplicacion create/update).
  - Slice 2: extraccion de infraestructura de exportacion a `workReportExportInfrastructure` (generacion PDF/ZIP y capa download/share para web/native).
  - `DashboardToolsTabContents.tsx` ahora orquesta los servicios y elimina logica repetida de IO.
  - Nuevos tests unitarios para servicio de importacion (`workReportImportService.test.ts`).
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Se mantiene comportamiento funcional al conservar mensajes/toasts y politicas de importacion existentes.
  - El componente principal sigue grande; se redujo complejidad interna pero no la superficie UI total.
- Tests ejecutados:
  - `npx eslint src/components/DashboardToolsTabContents.tsx src/services/workReportImportService.ts src/services/workReportExportInfrastructure.ts tests/workReportImportService.test.ts`
  - `npm exec vitest run tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Extraer la logica de seleccion de periodos/imagenes y armado de `ExportWorkReport` desde `DashboardToolsTabContents.tsx` a hooks/servicios dedicados.
  - Iniciar siguiente slice sobre `integrations/api/client.ts` o corte de `supabase.*` en `useWorkReports.ts`.
- Decision/es tomadas:
  - Mantener enfoque por slices verticales, priorizando primero puntos de mayor duplicacion (import/export) antes de descomponer UI de calendario/seleccion.

## Iteracion 2026-03-05 - DashboardTools Slice 3 (dominio de exportacion)
- Objetivo: mover reglas de negocio de exportacion fuera del componente para reducir acoplamiento UI+dominio.
- Alcance: `construction-log` (`src/components/DashboardToolsTabContents.tsx`, `src/services/workReportExportDomain.ts`, `tests/workReportExportDomain.test.ts`).
- Cambios realizados:
  - Nuevo servicio `workReportExportDomain.ts` con funciones puras para:
    - fecha offline efectiva por parte,
    - deteccion de imagenes de albaranes por parte,
    - sincronizacion de seleccion de imagenes,
    - mapeo de URIs seleccionadas por `report/group`,
    - naming de PDF/ZIP por periodo,
    - armado de archivos JSON de exportacion.
  - `DashboardToolsTabContents.tsx` ahora consume este dominio en los dialogos de exportacion (custom, single-period y data export), eliminando logica inline repetida.
  - `DashboardToolsTabContents.tsx` baja de ~3068 a ~2936 lineas tras este slice.
  - Nuevo test `tests/workReportExportDomain.test.ts` (6 casos).
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - El comportamiento visible se mantiene; se redujo riesgo de divergencia entre dialogos al centralizar reglas de exportacion.
  - Sigue pendiente extraer parte de orquestacion UI (estado/calendario) para cerrar la frontera UI->hooks.
- Tests ejecutados:
  - `npx eslint src/components/DashboardToolsTabContents.tsx src/services/workReportImportService.ts src/services/workReportExportInfrastructure.ts src/services/workReportExportDomain.ts tests/workReportImportService.test.ts tests/workReportExportDomain.test.ts`
  - `npm exec vitest run tests/workReportImportService.test.ts tests/workReportExportDomain.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Extraer estado y reglas de seleccion de periodos/calendario (custom + day/week/month) a hooks reutilizables.
  - Evaluar extraccion de `buildExportWorkReport` a modulo de dominio dedicado.
- Decision/es tomadas:
  - Mantener estrategia incremental: primero consolidar dominio/infra compartida, luego desacoplar estado UI en un siguiente slice.

## Iteracion 2026-03-05 - DashboardTools Slice 4 (hooks de calendario y periodos)
- Objetivo: desacoplar estado/reglas de calendario y seleccion de periodos de `DashboardToolsTabContents.tsx`.
- Alcance: `construction-log` (`src/components/DashboardToolsTabContents.tsx`, `src/hooks/useWorkReportExportCalendar.ts`, `src/hooks/useWorkReportExportPeriodSelection.ts`, `tests/workReportExportPeriodSelection.test.ts`).
- Cambios realizados:
  - Nuevo hook `useWorkReportExportCalendar` con configuracion compartida de calendario (rango de anios, `classNames`, opciones de mes/anio).
  - Nuevo hook `useWorkReportExportPeriodSelection` con:
    - estado y reglas de seleccion custom (dias/rangos),
    - estado y reglas de seleccion single-period (`day|week|month`),
    - estado multi-dia para export JSON,
    - utilidades puras de fechas (`toDateKey`, normalizacion y expansion de rangos).
  - `DashboardToolsTabContents.tsx` ahora consume esos hooks en los 3 dialogos de exportacion y elimina logica inline duplicada de calendario/periodos.
  - `DashboardToolsTabContents.tsx` baja de ~2936 a ~2753 lineas tras este slice.
  - Nuevo test `tests/workReportExportPeriodSelection.test.ts` (4 casos).
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Se mantiene el comportamiento funcional de exportacion; el cambio es estructural (estado/reglas movidos a hooks reutilizables).
  - Queda pendiente desacoplar el ensamblado de `ExportWorkReport` para reducir mas el peso del componente.
- Tests ejecutados:
  - `npx eslint src/components/DashboardToolsTabContents.tsx src/hooks/useWorkReportExportCalendar.ts src/hooks/useWorkReportExportPeriodSelection.ts tests/workReportExportPeriodSelection.test.ts`
  - `npm exec vitest run tests/workReportExportPeriodSelection.test.ts tests/workReportExportDomain.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Evaluar extraccion de `buildExportWorkReport` a modulo de dominio dedicado.
  - Evaluar hook comun para seleccion/sincronizacion de imagenes en export (custom + single-period).
- Decision/es tomadas:
  - Mantener descomposicion incremental por slices funcionales, priorizando duplicaciones con mayor costo de mantenimiento.

## Iteracion 2026-03-05 - DashboardTools Slice 5 (ensamblado ExportWorkReport)
- Objetivo: extraer el ensamblado de `ExportWorkReport` desde UI a dominio para reducir complejidad en `DashboardToolsTabContents.tsx`.
- Alcance: `construction-log` (`src/components/DashboardToolsTabContents.tsx`, `src/services/workReportExportDomain.ts`, `tests/workReportExportDomain.test.ts`).
- Cambios realizados:
  - Nuevo `buildExportWorkReport` exportado en `workReportExportDomain.ts`, con mapeo completo de `payload` a `ExportWorkReport` y soporte de filtrado de imagenes por grupo.
  - `DashboardToolsTabContents.tsx` deja de contener esa logica de dominio y pasa a reutilizar la funcion en:
    - exportacion custom,
    - exportacion single-period,
    - ventana de analisis.
  - `DashboardToolsTabContents.tsx` baja de ~2753 a ~2732 lineas tras este slice.
  - `tests/workReportExportDomain.test.ts` se amplio de 6 a 8 casos para cubrir ensamblado/fallbacks/status y filtrado de imagenes.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Se mantiene comportamiento funcional al mover logica 1:1 a dominio y cubrir el cambio con tests unitarios.
  - El componente sigue concentrando orquestacion UI; aun hay margen de modularizacion.
- Tests ejecutados:
  - `npx eslint src/components/DashboardToolsTabContents.tsx src/services/workReportExportDomain.ts tests/workReportExportDomain.test.ts`
  - `npm exec vitest run tests/workReportExportDomain.test.ts tests/workReportExportPeriodSelection.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Evaluar hook comun para seleccion/sincronizacion de imagenes en export (custom + single-period).
  - Continuar reduccion de orquestacion UI en `DashboardToolsTabContents.tsx`.
- Decision/es tomadas:
  - Consolidar todo el mapeo `offline WorkReport -> ExportWorkReport` en dominio para evitar divergencias entre export y analitica.

## Iteracion 2026-03-05 - DashboardTools Slice 6 (hook comun de imagenes de exportacion)
- Objetivo: eliminar duplicacion entre exportacion custom y single-period en seleccion/sincronizacion de imagenes de albaranes.
- Alcance: `construction-log` (`src/components/DashboardToolsTabContents.tsx`, `src/hooks/useWorkReportExportImageSelection.ts`).
- Cambios realizados:
  - Nuevo hook `useWorkReportExportImageSelection` con:
    - calculo de `imageCandidates` por partes seleccionados,
    - sincronizacion de seleccion al abrir dialogo (`syncSelectedImageIdsWithCandidates`),
    - acciones de UI (`toggle`, `selectAll`, `clear`),
    - `selectedImageMapByReport` e indicador `includeImagesInExport`.
  - `DashboardToolsTabContents.tsx` ahora reutiliza ese hook en:
    - exportacion personalizada,
    - exportacion por dia/semana/mes.
  - Se elimina logica duplicada de estado/efectos de imagenes en ambos dialogos.
  - `DashboardToolsTabContents.tsx` baja de ~2732 a ~2698 lineas tras este slice.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Refactor estructural sin cambio de reglas funcionales; se mantiene el dominio existente para candidatos/sincronizacion/mapeo.
  - El componente principal reduce duplicacion, pero sigue con responsabilidades de orquestacion UI.
- Tests ejecutados:
  - `npx eslint src/components/DashboardToolsTabContents.tsx src/hooks/useWorkReportExportImageSelection.ts`
  - `npm exec vitest run tests/workReportExportDomain.test.ts tests/workReportExportPeriodSelection.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Continuar reduccion de orquestacion UI en `DashboardToolsTabContents.tsx` (siguiente candidato: unificar flujo de toasts/compartir/export).
- Decision/es tomadas:
  - Mantener criterio de hooks reutilizables para estado/UI local y reglas de dominio en `services/*`.

## Iteracion 2026-03-05 - Slice 3A (corte Supabase en useWorkReports)
- Objetivo: eliminar acoplamiento directo a `supabase.*` dentro de `useWorkReports.ts` como primer paso del corte de Supabase en hooks de partes.
- Alcance: `construction-log` (`src/hooks/useWorkReports.ts`, `src/services/workReportsSupabaseGateway.ts`).
- Cambios realizados:
  - Nuevo gateway `workReportsSupabaseGateway` para encapsular operaciones legacy:
    - CRUD/realtime sobre `work_reports`,
    - lookup de `organization_id`,
    - uploads de imagenes a bucket legacy,
    - consultas auxiliares de notificaciones/descargas.
  - `useWorkReports.ts` deja de importar/usar `supabase` directamente y delega esas operaciones al gateway.
  - Se mantiene comportamiento funcional del hook (incluyendo realtime y notificaciones), pero con frontera `hook -> service`.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - El numero total de referencias `supabase.*` en `src` no baja aun (23 en 13 archivos), porque este slice es de desacoplo interno y no de sustitucion completa por API.
  - Se reduce deuda de frontera al sacar acceso directo a proveedor legacy del hook principal.
- Tests ejecutados:
  - `npm exec vitest run tests/workReportExportDomain.test.ts tests/workReportExportPeriodSelection.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
  - `npx eslint src/hooks/useWorkReports.ts src/services/workReportsSupabaseGateway.ts` -> con errores preexistentes de `no-explicit-any` en `useWorkReports.ts` (no introducidos por este slice).
- Pendientes:
  - Repetir patron de gateway/cliente API en `NotificationsCenter.tsx` y otros hooks/componentes con `supabase.*`.
  - Sustituir operaciones legacy del gateway por endpoints API dedicados donde aun no existen (notificaciones de cambio de parte, trazabilidad de descargas).
- Decision/es tomadas:
  - Priorizar desacoplo por frontera (eliminar `supabase` directo en hooks) antes de sustituir todas las operaciones por API para minimizar riesgo de regresion.

## Iteracion 2026-03-05 - Slice 3B (corte Supabase en NotificationsCenter)
- Objetivo: eliminar acceso directo a `supabase.*` desde `NotificationsCenter.tsx`, siguiendo el patron `component -> gateway`.
- Alcance: `construction-log` (`src/components/NotificationsCenter.tsx`, `src/services/notificationsSupabaseGateway.ts`).
- Cambios realizados:
  - Nuevo gateway `notificationsSupabaseGateway` para encapsular lecturas legacy de `work_reports` usadas por el centro de notificaciones:
    - carga de detalle por lista de IDs,
    - carga de parte por ID,
    - carga de partes por `work_id` para exportaciones por periodo.
  - `NotificationsCenter.tsx` deja de consultar Supabase directamente y delega en el gateway.
  - Se elimina mapeo duplicado en el componente para hidratar `WorkReport` desde filas DB.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - El numero global de referencias `supabase.*` en `src` no disminuye todavia: se movio el acceso desde UI a una capa de servicio de compatibilidad.
  - Se mantiene deuda de lint preexistente en `NotificationsCenter.tsx` (`no-explicit-any` y `exhaustive-deps`), sin cambios funcionales por este slice.
- Tests ejecutados:
  - `npm exec vitest run tests/workReportExportDomain.test.ts tests/workReportExportPeriodSelection.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
  - `npx eslint src/components/NotificationsCenter.tsx src/services/notificationsSupabaseGateway.ts` -> con errores/warnings preexistentes en `NotificationsCenter.tsx` (no introducidos por el gateway).
- Pendientes:
  - Aplicar patron de gateway/API en `useNotifications.ts`, `useMessages.ts` y demas modulos con `supabase.*` residual.
  - Sustituir gradualmente gateways legacy por endpoints API dedicados.
- Decision/es tomadas:
  - Priorizar el corte de dependencia directa en componentes antes de la sustitucion completa del proveedor legacy.

## Iteracion 2026-03-05 - Slice 3C (corte Supabase en useNotifications)
- Objetivo: eliminar acceso directo a `supabase.*` en `useNotifications.ts`, manteniendo el patron `hook -> gateway`.
- Alcance: `construction-log` (`src/hooks/useNotifications.ts`, `src/services/notificationsSupabaseGateway.ts`).
- Cambios realizados:
  - `notificationsSupabaseGateway` se amplia para encapsular:
    - listado de notificaciones por usuario,
    - suscripcion realtime de INSERT por usuario,
    - marcar una notificacion como leida,
    - marcar todas como leidas por usuario,
    - borrado de notificacion.
  - `useNotifications.ts` deja de importar/usar `supabase` directamente y delega toda la IO al gateway.
  - Se tipan errores como `unknown` y se centraliza `getErrorMessage` para toasts.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - El conteo global `supabase.*` en `src` no baja en este slice (24 referencias en 13 archivos): se movio el acceso desde hook a gateway de compatibilidad.
  - Realtime y CRUD conservan el mismo comportamiento funcional, con menor acoplamiento a proveedor en la capa de hook.
- Tests ejecutados:
  - `npx eslint src/hooks/useNotifications.ts src/services/notificationsSupabaseGateway.ts`
  - `npm exec vitest run tests/workReportExportDomain.test.ts tests/workReportExportPeriodSelection.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Aplicar patron equivalente en `useMessages.ts` y otros modulos con `supabase.*` residual.
  - Sustituir gradualmente gateways legacy por endpoints API dedicados.
- Decision/es tomadas:
  - Mantener estrategia de desacoplo por frontera (hook/componente -> gateway) antes de la sustitucion completa por API.

## Iteracion 2026-03-05 - Slice 3D (notificaciones API-only + endpoint DELETE)
- Objetivo: eliminar el uso de Supabase en flujo de notificaciones y operar solo con endpoints backend.
- Alcance:
  - Backend: `backend-fastapi/app/api/v1/notifications.py`, `backend-fastapi/app/services/notification_service.py`.
  - Frontend `construction-log`: `src/integrations/api/client.ts`, `src/hooks/useNotifications.ts`, `src/components/NotificationsCenter.tsx`, `src/types/notifications.ts`.
  - Documentacion: `docs/INTERFACES.md`, `documentacion/ENDPOINTS_UNIFICADOS.md`, `docs/ARCHITECTURE.md`, `docs/REPO_MAP.md`.
- Cambios realizados:
  - Nuevo endpoint backend `DELETE /api/v1/notifications/{notification_id}` (204/404) y servicio `delete_notification(...)`.
  - Cliente API ampliado con contratos de notificaciones (`listNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`, `deleteNotification`).
  - Cliente API ampliado con lectura de partes ERP (`listErpWorkReports`, `getErpWorkReport`) para soporte en `NotificationsCenter`.
  - `useNotifications.ts` migra de Supabase realtime/CRUD a API HTTP (polling cada 30s para refresco).
  - `NotificationsCenter.tsx` deja de usar gateway Supabase y resuelve detalles/descargas de partes via endpoints ERP.
  - Se elimina `src/services/notificationsSupabaseGateway.ts`.
  - Conteo residual `supabase.*` en `construction-log/src` baja de 24/13 a 22/12.
- Contratos impactados:
  - Nuevo contrato: `DELETE /api/v1/notifications/{notification_id}`.
  - Sin breaking change en contratos existentes.
- Tests ejecutados:
  - Frontend:
    - `npx eslint src/hooks/useNotifications.ts src/components/NotificationsCenter.tsx src/integrations/api/client.ts src/types/notifications.ts`
    - `npx tsc --noEmit`
    - `npm exec vitest run tests/workReportExportDomain.test.ts tests/workReportExportPeriodSelection.test.ts tests/workReportImportService.test.ts tests/reportsAnalysisWorkGrouping.test.ts`
  - Backend:
    - `python -m pytest backend-fastapi/tests/test_notifications_api.py`
- Pendientes:
  - Migrar `useMessages.ts` y otros modulos restantes con `supabase.*` a endpoints API.
  - Evaluar sustitucion de polling por canal push API (SSE/WebSocket) si se requiere near real-time.
- Decision/es tomadas:
  - Priorizar cumplimiento de arquitectura API-only en notificaciones, aun degradando temporalmente realtime a polling.

## Iteracion 2026-03-05 - Slice 3E (mensajeria API-only en useMessages)
- Objetivo: eliminar el uso residual de Supabase en `useMessages.ts` y dejar el chat interno operando contra API backend.
- Alcance:
  - Backend: `backend-fastapi/app/models/message.py`, `backend-fastapi/app/services/message_service.py`, `backend-fastapi/app/api/v1/messages.py`, `backend-fastapi/app/api/v1/router.py`, `backend-fastapi/app/db/base.py`.
  - Frontend `construction-log`: `src/integrations/api/client.ts`, `src/hooks/useMessages.ts`.
  - Tests/docs: `backend-fastapi/tests/test_messages_api.py`, `docs/INTERFACES.md`, `documentacion/ENDPOINTS_UNIFICADOS.md`.
- Cambios realizados:
  - Nuevo modulo backend `messages` con endpoints:
    - `GET /api/v1/messages`
    - `POST /api/v1/messages`
    - `POST /api/v1/messages/{message_id}/read`
    - `DELETE /api/v1/messages/conversation/{other_user_id}`
    - `DELETE /api/v1/messages/clear-all`
  - Nuevo modelo SQLModel `Message` (tenant scope + remitente/destinatario + estado de lectura).
  - Servicio de dominio `message_service` para listar/enviar/marcar leido/borrar conversacion/vaciar.
  - Cliente API frontend ampliado con contratos/fns de mensajeria.
  - `useMessages.ts` migrado a API HTTP con polling cada 15s (sin dependencia a `supabase`).
- Contratos impactados:
  - Nuevos contratos REST en `/api/v1/messages*` (sin breaking change en endpoints existentes).
- Riesgos/mitigaciones:
  - Se sustituye realtime Supabase por polling (15s) para mantener sincronizacion basica sin canal push.
  - La validacion de destinatario en backend exige usuario existente y del mismo tenant para IDs numericos.
- Tests ejecutados:
  - `python -m pytest backend-fastapi/tests/test_messages_api.py`
  - `npx eslint src/hooks/useMessages.ts src/integrations/api/client.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Migrar `useMessageableUsers.ts` y otros modulos restantes con `supabase.*`.
  - Evaluar SSE/WebSocket backend para recuperar tiempo real sin polling.
- Decision/es tomadas:
  - Priorizar eliminacion de dependencia Supabase en runtime aunque la latencia de refresco pase a ser polling temporal.

## Iteracion 2026-03-05 - API Client Slice 1 (modularizacion notifications/messages)
- Objetivo: iniciar la division de `src/integrations/api/client.ts` moviendo dominios de bajo acoplamiento a modulos separados, sin romper imports existentes.
- Alcance: `construction-log` (`src/integrations/api/client.ts`, `src/integrations/api/modules/notifications.ts`, `src/integrations/api/modules/messages.ts`).
- Cambios realizados:
  - Nuevo modulo `modules/notifications.ts` con contratos y operaciones de notificaciones (`list`, `read`, `read-all`, `delete`) usando factory `createNotificationsApi(...)`.
  - Nuevo modulo `modules/messages.ts` con contratos y operaciones de mensajeria (`list`, `create`, `read`, `delete conversation`, `clear-all`) usando factory `createMessagesApi(...)`.
  - `client.ts` pasa a funcionar como fachada compatible:
    - re-exporta tipos de ambos modulos,
    - inicializa factories con `apiFetchJson` + `buildQueryParams`,
    - mantiene las mismas funciones exportadas usadas por el resto de la app.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Riesgo bajo: se conserva API publica del modulo `client.ts` y no se tocaron consumidores.
  - Se prepara el patron para extraer siguientes dominios (`users`, `attachments`, `erp`) con el mismo enfoque.
- Tests ejecutados:
  - `npx eslint src/integrations/api/client.ts src/integrations/api/modules/notifications.ts src/integrations/api/modules/messages.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - Continuar con API Client Slice 2: extraer siguiente bloque grande (`attachments/shared-files` o `users/tenants`).
- Decision/es tomadas:
  - Priorizar modularizacion incremental por dominios autocontenidos para minimizar riesgo de regresion.

## Iteracion 2026-03-05 - API Client Slice 2 (modularizacion attachments/shared-files)
- Objetivo: continuar la division de `src/integrations/api/client.ts` extrayendo el dominio de adjuntos e intercambio de archivos.
- Alcance: `construction-log` (`src/integrations/api/client.ts`, `src/integrations/api/modules/attachments.ts`).
- Cambios realizados:
  - Nuevo modulo `modules/attachments.ts` con contratos y operaciones:
    - adjuntos de partes (`list/create/update/delete`),
    - imagen generica (`upload`, `delete by url`),
    - archivos compartidos (`list/create/download/mark-downloaded/delete`).
  - `client.ts` mantiene compatibilidad:
    - re-exporta tipos del nuevo modulo,
    - delega funciones existentes mediante factory `createAttachmentsApi(...)`.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Riesgo bajo: no se cambian rutas ni firmas exportadas en `client.ts`; solo se mueve implementacion.
  - Se conserva manejo de errores de descarga (`status` en error) en el modulo extraido.
- Tests ejecutados:
  - `npx eslint src/integrations/api/client.ts src/integrations/api/modules/attachments.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - API Client Slice 3: extraer bloque `users/tenants` o `erp-work-reports` para seguir reduciendo tamano del cliente monolitico.
- Decision/es tomadas:
  - Seguir extraccion por dominios de frontera clara para evitar cambios transversales grandes.

## Iteracion 2026-03-05 - API Client Slice 3 (modularizacion users/tenants)
- Objetivo: seguir reduciendo `src/integrations/api/client.ts` moviendo el dominio de usuarios y tenants a modulo dedicado.
- Alcance: `construction-log` (`src/integrations/api/client.ts`, `src/integrations/api/modules/users.ts`).
- Cambios realizados:
  - Nuevo modulo `modules/users.ts` con:
    - contratos de tipos (`ApiUser`, `ApiTenant`, `UserCreateRequest`, `UserUpdateRequest`, `UserStatusUpdateRequest`, `UserProfileUpdateRequest`, `ChangePasswordRequest`),
    - utilidad `normalizeApiUser(...)`,
    - operaciones (`listUsersByTenant`, `listTenants`, `createUser`, `updateUser`, `updateUserStatus`, `deleteUser`, `updateCurrentUserProfile`, `changePassword`).
  - `client.ts` mantiene compatibilidad:
    - re-export de tipos desde `modules/users.ts`,
    - delegacion de funciones de usuarios/tenants mediante `createUsersApi(...)`,
    - `getCurrentUser` sigue disponible y reutiliza `normalizeApiUser` del modulo.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Riesgo bajo: se mantiene la misma API publica de `client.ts` para consumidores.
  - La normalizacion de roles queda centralizada para evitar divergencias.
- Tests ejecutados:
  - `npx eslint src/integrations/api/client.ts src/integrations/api/modules/users.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - API Client Slice 4: extraer `organization/branding/preferences` o bloque ERP para continuar la reduccion del monolito.
- Decision/es tomadas:
  - Mantener la estrategia de fachada estable en `client.ts` y mover implementacion por dominios.

## Iteracion 2026-03-05 - API Client Slice 4 (modularizacion organization/branding/preferences)
- Objetivo: continuar la reduccion del cliente API monolitico extrayendo el bloque de organizacion, branding y preferencias de usuario.
- Alcance: `construction-log` (`src/integrations/api/client.ts`, `src/integrations/api/modules/organization.ts`).
- Cambios realizados:
  - Nuevo modulo `modules/organization.ts` con contratos y operaciones:
    - organizacion (`get/update`, `upload/remove logo`),
    - branding por tenant,
    - preferencias de usuario (`get/update`).
  - `client.ts` mantiene compatibilidad:
    - re-exporta tipos (`ApiOrganization`, `BrandingTenantApi`, `UserPreferencesApi`, etc.),
    - delega las funciones existentes mediante `createOrganizationApi(...)`.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Riesgo bajo: no cambian nombres de funciones ni rutas; se mueve implementacion.
  - El tratamiento de multipart para logo se conserva sin cambios.
- Tests ejecutados:
  - `npx eslint src/integrations/api/client.ts src/integrations/api/modules/organization.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - API Client Slice 5: extraer bloque ERP o AI Runtime para continuar la modularizacion del archivo principal.
- Decision/es tomadas:
  - Priorizar dominios autocontenidos (sin helpers de tenancy) para mantener slices cortos y seguros.

## Iteracion 2026-03-05 - API Client Slice 5 (modularizacion tools)
- Objetivo: continuar la descomposicion de `src/integrations/api/client.ts` extrayendo el bloque de herramientas (catalogo, activacion y lanzamiento).
- Alcance: `construction-log` (`src/integrations/api/client.ts`, `src/integrations/api/modules/tools.ts`).
- Cambios realizados:
  - Nuevo modulo `modules/tools.ts` con:
    - tipos `ApiTool` y `ToolLaunchResponse`,
    - operaciones `listToolCatalog`, `listToolsByTenant`, `launchTool`, `setToolEnabledForTenant`.
  - `client.ts` mantiene compatibilidad:
    - re-exporta tipos de tools,
    - delega funciones existentes via `createToolsApi(...)`.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Riesgo bajo: las firmas exportadas y rutas backend se mantienen intactas.
  - Se evita tocar consumidores existentes (`ToolsSettingsPanel`) al conservar nombres públicos.
- Tests ejecutados:
  - `npx eslint src/integrations/api/client.ts src/integrations/api/modules/tools.ts`
  - `npx tsc --noEmit`
- Pendientes:
  - API Client Slice 6: extraer un bloque grande (`erp` o `ai_runtime`) para acelerar la reduccion de lineas del cliente principal.
- Decision/es tomadas:
  - Ejecutar primero bloques pequenos/autocontenidos para consolidar patron y reducir riesgo antes de entrar en dominios grandes.

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

## Iteracion 2026-03-03 - FASE 1 / Modulo 1: PASO C desactivacion cron legacy Supabase
- Objetivo: desactivar el cron legacy de Supabase para auto-duplicado de maquinaria de alquiler.
- Alcance: `construction-log-supabase-local` (migracion SQL de apagado de jobs pg_cron) + documentacion tecnica.
- Cambios realizados:
  - Nueva migracion `20260303140004_disable_auto_duplicate_rental_machinery_cron.sql`.
  - Unschedule idempotente de jobs `auto-duplicate-rental-machinery-daily` y `auto-duplicate-rental-machinery-daily-0700`.
  - Fallback por `cron.job.command` para jobs legacy que invoquen `trigger_auto_duplicate_rental_machinery` o `/functions/v1/auto-duplicate-rental-machinery`.
  - Comentario de deprecacion en migracion: `DEPRECATED: moved to backend celery beat task AUTO_DUPLICATE_JOB_NAME`.
- Contratos impactados:
  - Sin cambios de contratos HTTP.
- Riesgos/mitigaciones:
  - Si `pg_cron` no esta instalado o `cron.job` no esta disponible, la migracion no falla (best effort).
  - La periodicidad operativa queda centralizada en Celery Beat del backend.
- Tests ejecutados:
  - Verificacion estatica de SQL (sin levantar Supabase local): migracion sin `Authorization`, `Bearer` ni `net.http_post`.
- Pendientes:
  - Continuar retiro de `apps/construction-log/construction-log-supabase-local` segun plan de migracion.
- Decision/es tomadas:
  - No reforzar Supabase legacy; mantener unicamente el scheduler backend (`auto_duplicate_rental_machinery_daily` en Celery Beat).
