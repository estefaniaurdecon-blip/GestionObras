# REFACTOR PROGRESS
> Guia de continuidad para sesiones futuras. Fecha ultima actualizacion: 2026-03-18.

---

## Estado global

| Fase | Descripcion | Estado |
|------|-------------|--------|
| Fase 1 | Foundation: fix TS + eliminar utilidades duplicadas | COMPLETADA |
| Fase 2 | Componentes grandes (frontend) | EN CURSO - 1/3 completado + slices 2.2.1 y 2.2.2 completados |
| Fase 3 | Monolitos backend | Pendiente |
| Fase 4 | Cleanup hooks WorkReport + ESLint | Pendiente |
| Fase 5 | frontend-react (deferred) | Pendiente |

---

## FASE 1 - COMPLETADA

### 1.1 Fix TypeScript: `FileTransfer.tsx`
- Archivo: `src/components/FileTransfer.tsx` line 222
- Problema: llamaba `downloadFile(f, downDir, customFolder)` con 3 args pero `useSharedFiles.ts` solo aceptaba 1
- Fix: `useSharedFiles.ts` - firma actualizada a `downloadFile(sharedFile, _downDir?, _customFolder?)`
- Verificado: `tsc --noEmit` sin errores

### 1.2 Utilidades AccessControl duplicadas -> `utils/accessControlHelpers.ts`
- Problema: `useAccessControlReports.ts` y `useAccessControlSync.ts` definian copias locales de `asRecord`, `toStringValue`, `toOptionalString`, `toIsoDate`, `toAccessEntries`
- Creado: `src/utils/accessControlHelpers.ts` - exporta `toAccessEntries` (usa `asRecord`, `toStringValue`, `toOptionalString` de `indexHelpers.ts`)
- Actualizado:
  - `useAccessControlReports.ts`: eliminadas 5 funciones locales, importa `asRecord`, `toIsoDate`, `toOptionalString`, `toStringValue` desde `@/pages/indexHelpers` y `toAccessEntries` desde `@/utils/accessControlHelpers`
  - `useAccessControlSync.ts`: eliminadas 3 funciones locales, importa `toAccessEntries` desde `@/utils/accessControlHelpers`
- Fuente canonica de las otras utils: `@/pages/indexHelpers` (ya las exportaba)

### 1.3 Helpers de normalizacion -> `utils/valueNormalization.ts`
- Problema: `parseDateKey`, `parseReportDateValue`, `safeText`, `safeNumber`, `safeArray`, `firstFiniteNumber`, `pickCostReference` estaban copiadas en 5 archivos distintos
- Creado: `src/utils/valueNormalization.ts` - exporta las 7 funciones
- Importante: `safeArray` retorna `any[]` (con eslint-disable) porque el codigo cliente usa `asRecord()` para narrowing interno. No cambiar a `unknown[]` sin actualizar todos los call sites.
- Importante: `erpBudget.ts` tiene su propia `safeNumber` con coercion de strings (`Number(value)`) - comportamiento diferente. No consolidar.
- Archivos actualizados (eliminadas copias locales, importan de `@/utils/valueNormalization`):
  - `src/components/DashboardToolsPanelContent.tsx`
  - `src/components/DashboardToolsTabContents.tsx`
  - `src/components/periodHoursChartUtils.ts`
  - `src/services/workReportImportService.ts`
  - `src/services/workReportExportDomain.ts`

---

## FASE 2 - EN CURSO

### 2.1 Split `DashboardToolsPanelContent.tsx` - COMPLETADO
- Antes: 2657 lineas, 1 archivo
- Despues: ~115 lineas (solo shell + tipos publicos)
- Creados 8 archivos en `src/components/tools-panel/`:

| Archivo | Contenido | Lineas aprox |
|---------|-----------|--------------|
| `toolsPanelShared.tsx` | `CalendarNumberIcon`, `CalendarCustomIcon`, `ToolsOptionButton`, `uniqueStrings`, `normalizePersonDisplayName` | ~50 |
| `BulkExportCustomDialog.tsx` | Dialog exportacion por seleccion personalizada | ~390 |
| `BulkExportSinglePeriodDialog.tsx` | Dialog exportacion dia/semana/mes | ~385 |
| `DataManagementExportDialog.tsx` | Dialog export JSON | ~165 |
| `DataManagementImportDialog.tsx` | Dialog import JSON con resolucion conflictos | ~220 |
| `ToolActions.tsx` | Switcher que renderiza dialogs segun tab activo | ~85 |
| `analysisTypes.tsx` | Tipos analysis, constantes, `AnalysisMetricCard`, utils Excel | ~120 |
| `ReportsAnalysisWindow.tsx` | Ventana analisis de partes (~1000L) | ~1000 |

- Verificado: `tsc --noEmit` pasa con 0 errores tras el split

### 2.2 Split `GenerateWorkReportPanel.tsx` - EN CURSO
- Tamano original: 2654 lineas
- Tamano actual: 1589 lineas

#### 2.2.1 Slice completado - `buildWorkReportForExport`
- Completado: extraccion de `buildWorkReportForExport` a `src/components/work-report/buildWorkReportForExport.ts`
- Nuevo modulo: ~255 lineas, funcion pura orientada a exportacion PDF/Excel
- `GenerateWorkReportPanel.tsx` ya no contiene el mapper grande inline; ahora solo compone estado -> `createExportReport()` -> `buildWorkReportForExport(...)`
- Dependencias de dominio preservadas: `subcontractTotalsByGroupId`, `mapForemanRoleForReport`, `mapSubcontractUnitToReportUnit`, `sanitizeText`, `nonNegative`, `nonNegativeInt`
- Verificado: `npx tsc -p tsconfig.app.json --noEmit` pasa con 0 errores despues del slice

#### 2.2.2 Slice completado - `useWorkReportScanOrchestrator`
- Completado: extraccion de la orquestacion de escaneo a `src/hooks/useWorkReportScanOrchestrator.ts`
- Nuevo hook: ~1365 lineas
- El hook absorbe:
  - `useAlbaranScanController`
  - los `useState` de scan review, dialogs de resolucion, viewer de adjuntos y diferencias de coste
  - builders de filas/materiales/servicios
  - apply callbacks, resolucion de duplicados y handlers de review
- Dependency inversion aplicada:
  - recibe `readOnly`
  - recibe `materialGroups` / `setMaterialGroups`
  - recibe `setOpenMaterialGroups` y `setActiveMaterialGroupId`
- Resultado:
  - `GenerateWorkReportPanel.tsx` baja de 2509 a 1589 lineas
  - el panel ya no conoce el detalle del scanner ni la maquinaria interna del flujo de dialogs
- Verificado: `npx tsc -p tsconfig.app.json --noEmit` pasa con 0 errores despues del slice

#### 2.2.3 Siguiente slice recomendado - `WorkReportScanDialogsPortal.tsx`
- Extraer render-only de dialogs de scan:
  - `ScanReviewDialog`
  - `ServiceScanDialog`
  - `NoPriceScanDialog`
  - `RescanConfirmDialog`
  - `DuplicateDialog`
  - `CostDifferenceDialog`
  - `AlbaranDocumentViewerModal`
- Objetivo:
  - quitar ~120-170 lineas mas de JSX del panel
  - dejar `GenerateWorkReportPanel.tsx` centrado en secciones y acciones de guardado/exportacion
- Riesgo: BAJO-MEDIO
  - ya no depende de mover logica; solo props wiring

#### 2.2.4 Nuevo siguiente hotspot - `useWorkReportScanOrchestrator.ts`
- Tamano actual: ~1365 lineas
- El boundary ahora es mucho mejor, pero el hook ha quedado como nuevo concentrador
- Split futuro recomendado dentro del hook:
  1. `work-report/scan/scanResultBuilders.ts`
  2. `work-report/scan/scanResolutionHandlers.ts`
  3. `useWorkReportScanReviewState.ts`
- Regla:
  - no volver a meter logica nueva de dominio en `GenerateWorkReportPanel.tsx`
  - si el scanner crece, que crezca en modulos de `work-report/scan/*`

### 2.3 Split `WorkReportList.tsx` - PENDIENTE
- Tamano actual: ~2589 lineas
- Plan:
  1. `useWorkReportListFilters.ts` - estado de filtros + derivaciones (`filteredReports`, `weeklyGroups`, `monthlyGroups`, `foremanGroups`, etc.)
  2. `useWorkReportBulkDownload.ts` - bulk PDF/ZIP/Excel con estado `selectedReports`, `isDownloadingBulk`, etc.
  3. `useWorkReportSingleDownload.ts` - viewer PDF individual + descarga Excel individual
  4. `WorkReportListDialogs.tsx` - portal render-only con los 5 dialogs inline
  5. Extraer `getWeekNumber` a `utils/dateUtils.ts` (esta duplicada entre grouping y `handleOfficeExport`)
- Riesgo medio: `filteredReports` es consumido por bulk download y por el render JSX; debe calcularse en el padre o en el hook de filtros y pasarse down

---

## FASE 3 - PENDIENTE (Backend)

### 3.1 Split `erp_service.py` (~2895 lineas)
- Extraer 8 domain services:
  - `ProjectService` (proyectos, actividades, hitos)
  - `BudgetService` (presupuestos, calculos)
  - `TimeTrackingService` (entradas de tiempo, sesiones)
  - `WorkReportService` (CRUD partes, sync, archivo)
  - `AccessControlService` (reportes AC, creacion, updates)
  - `RentalService` (maquinaria, asignaciones)
  - `PostventaService` (WorkPostventa CRUD)
  - `RepasoService` (WorkRepaso CRUD)

### 3.2 Split `ai_runtime.py` (~2119 lineas)
- Extraer 3 servicios + 1 gateway:
  - `AISummaryReportService` (generacion informes resumen)
  - `AIImageAnalysisService` (OCR imagenes de obra)
  - `AIStandardizationService` (matching empresa, deduplicacion)
  - `AIIntegrationGateway` (coordinacion rutas, error handling)

---

## FASE 4 - PENDIENTE (Cleanup)

### 4.1 Consolidar hooks WorkReport
- `useWorkReportsLifecycle.ts` (685L) + `useWorkReportMutations.ts` (587L) tienen fronteras poco claras
- Propuesta: merge mutations dentro de lifecycle como handlers privados
- Crear `useWorkReportExportState` unificando los 3 hooks de seleccion de periodo de exportacion

### 4.2 ESLint `no-explicit-any`
- Deuda activa en multiples archivos
- No bloquea build pero bloquea CI/CD gates
- Abordar archivo por archivo despues de cada split (contexto fresco)

### 4.3 Fix pre-existente: `IndexSecondaryTabs.tsx`
- El error original de memoria (status `closed`) parece haberse resuelto solo o el archivo cambio
- En la sesion 2026-03-18 el unico error TS era `FileTransfer.tsx` (ya corregido)
- Verificar en proxima sesion que sigue sin error

### 4.4 Nuevo hotspot detectado: `src/components/work-report/helpers.ts`
- Tamano actual: 709 lineas
- Mezcla demasiadas responsabilidades:
  - factories (`create*`)
  - normalizacion
  - migraciones legacy
  - calculo de totales
  - mapeos de exportacion
- Regla para la siguiente fase:
  - mantenerlo como fuente canonica de primitivas ya consolidadas
  - no seguir metiendo ahi la orquestacion del scan
- Posible split futuro:
  1. `factories.ts`
  2. `normalizers.ts`
  3. `subcontractTotals.ts`
  4. `reportMappers.ts`

### 4.5 Nuevo hotspot detectado: `src/hooks/useWorkReportScanOrchestrator.ts`
- Tamano actual: 1365 lineas
- Es una mejora clara frente al panel gigante, pero sigue acumulando demasiadas capas:
  - estado UI de dialogs
  - control del scanner
  - transformaciones de dominio
  - apply/update de materiales
- Siguiente disciplina:
  - mantenerlo como boundary temporal
  - empezar a extraer funciones puras y estado especializado antes de seguir ampliandolo

---

## FASE 5 - PENDIENTE (frontend-react, deferred por usuario)

Monolitos en `apps/frontend-react/`:
- `TimeControlPage.tsx` (~1877L) -> hooks: `useTimeSessionManager`, `useActiveSessionTracker`
- `ContractsModule.tsx` (~1950L) -> hooks: `useContractManager`, `useApprovalEngine`
- `ErpTasksPage.tsx` (~1547L) -> hooks: `useTaskManager`, `useTaskTimeline`
- `HrPage.tsx` (~1571L) -> hooks: `useDepartmentManager`, `useEmployeeDirectory`

---

## Nuevos archivos creados en esta sesion

```text
src/
  utils/
    accessControlHelpers.ts
    valueNormalization.ts
  components/
    tools-panel/
      toolsPanelShared.tsx
      BulkExportCustomDialog.tsx
      BulkExportSinglePeriodDialog.tsx
      DataManagementExportDialog.tsx
      DataManagementImportDialog.tsx
      ToolActions.tsx
      analysisTypes.tsx
      ReportsAnalysisWindow.tsx
    work-report/
      buildWorkReportForExport.ts
  hooks/
    useWorkReportScanOrchestrator.ts
    useSharedFiles.ts  <- MODIFICADO: downloadFile acepta _downDir?, _customFolder?
```

---

## Invariantes a respetar en futuros cambios

1. `safeArray` retorna `any[]`. No cambiar sin actualizar call sites.
2. `erpBudget.safeNumber` es diferente. Coerciona strings; no fusionar con `valueNormalization.safeNumber`.
3. Frontera UI -> hooks -> gateways: ningun componente debe importar directamente de `integrations/supabase/*` ni hacer llamadas a API directamente.
4. `tsc --noEmit` debe pasar a 0 errores despues de cada slice. Verificar siempre antes de terminar.
5. Sin big-bang refactors: slices incrementales, cada uno verificado con TypeScript.
6. No cambiar contratos publicos sin aprobacion del usuario (`ToolsPanelContentProps`, firmas de hooks expuestos).
7. Para `GenerateWorkReportPanel`, priorizar extraer logica de scan a hook antes de mover mas JSX.
8. No usar `work-report/helpers.ts` como cajon de sastre para logica nueva de alto nivel.
9. No volver a meter logica de escaneo en `GenerateWorkReportPanel.tsx`; usar `useWorkReportScanOrchestrator` o modulos `work-report/scan/*`.

---

## Comandos utiles

```bash
# Desde la raiz del repo
cd apps/construction-log/construction-log-supabase-local

# Verificar TypeScript
npx tsc -p tsconfig.app.json --noEmit

# Build completo
npm run build

# Lint solo archivos cambiados
npm run lint:changed
```
