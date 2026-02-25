# DOCINT Config Audit

Fecha de auditoria: 2026-02-25
Rama: `fix/docint-config-audit`

## Objetivo
Verificar y ajustar el flujo de escaneo de albaranes para DocInt-only:
- Capacitor/Android -> `docint-proxy` -> UI revision -> aplicar.

## Fase 0 - Estado inicial (antes de cambios)

### 1) Llamadas DocInt y modelo en uso
- Entrada principal: `azure-functions/docint-proxy/src/functions/processAlbaran.ts`.
- Llamada a DocInt: `client.analyzeWithModel(...)`.
- Endpoint publicado: `POST /api/v1/albaranes/process`.
- Estado inicial detectado:
  - Primario: `prebuilt-layout`.
  - Fallback: `prebuilt-invoice` (desalineado con objetivo).

### 2) Definicion de modelos (env/default)
- Defaults runtime en `processAlbaran.ts`.
- Ejemplo env en `local.settings.example.json`.
- Script de diagnostico en `scripts/diagnose-fixtures.cjs`.

### 3) Parser de servicio
- `parseByModel(...)` ya existia.
- El parser de servicio no vaciaba items por defecto cuando `docType=SERVICE_MACHINERY`.
- `NO_PRICE_COLUMNS` se aplicaba al flujo de materiales.

### 4) Frontend (modo servicio)
- Normalizacion de `docType` en plugin (`albaranScanner.ts`).
- `ScanReviewDialog` y `MaterialsSection` ya tenian logica de servicio, pero no estaba reforzada en todos los puntos de persistencia/render.

### 5) Android
- `AlbaranDocIntClient.kt` vaciaba items en materiales sin precio.
- Servicio no entraba en ese vaciado, pero `UNKNOWN` podia degradar casos de servicio.

### 6) Evidencia Supabase inicial
- Imports `from '@/integrations/supabase/client'`: 51.
- `supabase.functions.invoke(...)`: 8.
- `VITE_SUPABASE_*` en tipado/env: presentes.

## Cambios aplicados

### Commit 1
- `c2ebe63` - `fix(docint): layout-first + model-aware parsing`
- Cambios:
  - Fallback por defecto a `prebuilt-read`.
  - Ruteo model-aware reforzado (`invoice` vs `layout/read`).
  - Sanitizacion HTML en parser.
  - Alineacion en `local.settings.example.json` y script de diagnostico.

### Commit 2
- `8b1c387` - `fix(android): keep service items`
- Cambios:
  - Android conserva items en servicio aunque no haya precio.
  - `UNKNOWN` con senales de servicio se eleva a `SERVICE_MACHINERY`.
  - `NO_PRICE_COLUMNS` que vacia items queda limitado a `MATERIALS_TABLE`.

### Commit 3
- `257cd67` - `fix(ui): normalize docType + service copy`
- Cambios:
  - `normalizeDocType` exportado y aplicado en revision/persistencia/render.
  - `ScanReviewDialog` usa docType normalizado para activar bloque de servicio.
  - `MaterialsSection` decide bloque servicio por docType normalizado y/o `serviceLines`.
  - `GenerateWorkReportPanel` aplica docType normalizado al confirmar revision.

### Commit 4
- `61e368e` - `chore(clean): remove supabase runtime`
- Cambios:
  - Retirado `AdvancedMaterialScanner` (wiring y archivo).
  - `useAppUpdates` migra de Supabase Function a API propia (`POST /api/v1/updates/check`).
  - Nuevo endpoint backend `updates` + tests.
  - `AIAssistantChat` deja de usar `VITE_SUPABASE_*` y pasa a `/api/v1/ai/construction-chat`.
  - Nuevo endpoint backend seguro para ese path (respuesta SSE controlada).
  - Eliminado `VITE_SUPABASE_*` de `vite-env.d.ts`.
  - Catalogo unificado en `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Validacion por bloque (post-commit)

### Commit 1
- Frontend: `npm ci` OK, `npm run build` OK.
- Functions: `npm ci` con incidencia local previa de lock en una ejecucion, compilacion final OK.
- Android: `./gradlew.bat :app:assembleDebug` OK.

### Commit 2
- Frontend: `npm ci` OK, `npm run build` OK.
- Frontend lint: falla por deuda historica global (no introducida en este corte).
- Functions: `npm ci` OK, `npm run build` OK.
- Android: `./gradlew.bat :app:assembleDebug` OK.

### Commit 3
- Frontend: `npm run build` OK.
- Frontend lint: falla por deuda historica global.
- Functions: `npm run build` OK.
- Android: `./gradlew.bat :app:assembleDebug` OK.

### Commit 4
- Frontend: `npm run build` OK.
- Frontend lint: falla por deuda historica global.
- Functions: `npm run build` OK.
- Android: `./gradlew.bat :app:assembleDebug` OK.

### Backend tests adicionales
- `python -m pytest tests/test_updates_api.py` -> no ejecutable en este entorno por incompatibilidad local con Python 3.14 y stack actual (error de carga en modelos).

## Verificacion final contra criterios

### B) Config DocInt
- Primario: `prebuilt-layout` -> OK.
- Fallback: `prebuilt-read` -> OK.
- API version: `2024-11-30` -> OK.
- `parseByModel(modelId, raw)` -> OK.

### C) Servicio manuscrito / mapeos
- Android no vacia items para servicio -> OK.
- Frontend normaliza docType y activa rama servicio con docType normalizado y/o `serviceLines` -> OK.
- Parser backend no vacia servicio por ausencia de precio -> OK.

### A) DocInt-only estricto (estado real)
- Flujo principal de escaneo DocInt: operativo.
- Entry points alternativos retirados en este corte:
  - `AdvancedMaterialScanner`: retirado.
  - `check-updates` Supabase: migrado.
- Deuda residual (NO cumple aun DocInt-only total de toda la app):
  - Imports runtime a cliente supabase: 51.
  - `supabase.functions.invoke(...)`: 8.
  - Invokes pendientes:
    - `generate-summary-report`
    - `standardize-companies` (x2)
    - `analyze-inventory`
    - `analyze-logo-colors`
    - `analyze-work-image`
    - `populate-inventory-from-reports`
    - `clean-inventory`

## Smoke tests funcionales

### Ejecutados en este bloque
- Smoke tecnico por compilacion cruzada:
  - Frontend build OK.
  - Functions build OK.
  - Android assembleDebug OK.

### Pendiente manual con documentos reales
- Caso A materiales (tabla economica) -> revisar -> aplicar.
- Caso B servicio manuscrito -> revisar -> aplicar y ver `Detalle de servicio`.
- Caso C input sucio con HTML en proveedor/labels -> verificar sanitizacion visual.

## Comandos clave usados

```powershell
# Auditoria / evidencias
rg -n "DOCINT_MODEL_PRIMARY|DOCINT_MODEL_FALLBACK|DOCINT_API_VERSION|prebuilt-layout|prebuilt-read|parseByModel" azure-functions/docint-proxy
rg -n "normalizeDocType|SERVICE_MACHINERY|serviceLines" apps/construction-log/construction-log-supabase-local/src
rg -n "supabase\.functions\.invoke\(" apps/construction-log/construction-log-supabase-local/src
rg -n "from '@/integrations/supabase/client'" apps/construction-log/construction-log-supabase-local/src

# Validacion
npm run build
npm run lint
npm run build   # docint-proxy
./gradlew.bat :app:assembleDebug
```

## Conclusion
El objetivo tecnico principal del flujo DocInt (modelos, parser model-aware, servicio en Android/UI y aplicacion de revision) queda cubierto.
La retirada total de runtime Supabase en toda la aplicacion sigue pendiente por modulos; este bloque reduce deuda, pero no la elimina por completo.
