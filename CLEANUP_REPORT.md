# INFORME_DE_LIMPIEZA

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Objetivo
Mantener un flujo de escaneo exclusivamente DocInt:

`plugin Capacitor -> docint-proxy -> revision en UI -> aplicar en parte`.

Todo pipeline alternativo (Supabase/Ollama) se retira por fases sin romper el flujo principal.

## Estado actual

- Flujo principal DocInt activo en frontend, Android y proxy.
- `AdvancedMaterialScanner` retirado de ejecucion y eliminado del arbol de codigo.
- Cableado de Ollama retirado de `GenerateWorkReportPanel` y `ScanReviewDialog`.
- `useAppUpdates` ya consume API propia (sin Supabase en ejecucion en ese flujo).
- Catalogo de endpoints unificado en un solo archivo:
  `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Verificaciones tecnicas aplicadas

- Normalizacion defensiva de `docType` en `src/plugins/albaranScanner.ts`.
- Android no vacia `items` en documentos de servicio
  (`AlbaranDocIntClient.kt`).
- `MaterialsSection` renderiza bloque de servicio por `docType` normalizado
  y/o `serviceLines`.
- Se eliminaron duplicados de tipos locales en `MaterialsSection`
  reutilizando tipos canonicos compartidos.

## Pendiente operativo (prioridad alta)

1. Completar Fase 2.2 por modulos de ejecucion restantes:
   - Migrar las invocaciones `supabase.functions.invoke(...)` que siguen activas.
   - Sustituir por endpoints API propios (o retirar modulo si era legado).
2. Ejecutar y documentar smoke test minimo en tablet fisica:
   - Caso A: materiales.
   - Caso B: servicio.
   - Caso C: entrada sucia/sanitizacion.

## Limpieza adicional realizada

- Se eliminaron artefactos temporales locales `tmp_*` generados durante pruebas.
- Se eliminaron `node_modules` dentro de `referencias/saas_original_companero`
  para evitar ruido en IDE y diagnosticos falsos.
- Se eliminaron archivos temporales versionados sin uso:
  - `frontend-react/src/components/erp/budget/BudgetSection_tmp.txt`
  - `frontend-react/src/components/erp/budget/BudgetSection_tmp2.txt`

## Regla de mantenimiento documental

- No duplicar listados de rutas en otros documentos.
- Cualquier cambio de endpoint se refleja primero en
  `documentacion/ENDPOINTS_UNIFICADOS.md`.
