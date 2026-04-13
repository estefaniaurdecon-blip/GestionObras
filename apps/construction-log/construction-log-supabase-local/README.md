# Construction Log Frontend

Aplicacion React/Vite principal para obra, ERP operativo, mensajeria y tareas
offline.

## Desarrollo

```bash
npm install
npm run dev
```

URL local: `http://localhost:8080`

En desarrollo la app consume `/api/*` por proxy same-origin. El destino se
controla con `VITE_API_PROXY_TARGET`.

## Scripts disponibles

- `npm run dev`
- `npm run build`
- `npm run build:dev`
- `npm run lint`
- `npm run lint:changed`
- `npm run preview`
- `npm run android:migration:check`
- `npm run sync:robustness`
- `npm run perf:android:capture`

## Estructura actual

Componentes por dominio bajo `src/components/`:

- `economic-management/`
- `work-management/`
- `work-postventas/`
- `work-repasos/`
- `tools-panel/`
- `work-report/`
- `messaging/`
- `admin/`
- `api/`

Hooks relevantes bajo `src/hooks/`:

- `useWorkReportScanOrchestrator`
- `useScanReviewState`
- `useWorkReportExportActions`
- `useWorkReportFormHandlers`
- `useWorkReportGrouping`
- `useWorkReportListFilters`
- `useWorkReportExportImageSelection`

## Estado de la refactorizacion

- Se estan descomponiendo pantallas grandes en piezas por dominio.
- El foco actual esta en economic management, partes, postventas, repasos y
  herramientas de dashboard.
- Hay tests de dominio en `tests/`, pero a dia de hoy no existe un script
  unificado `npm test` para toda la app; los gates activos siguen siendo build
  y lint incremental.

## Recomendaciones de trabajo

- Para cambios pequeños usa `lint:changed`.
- Para una validacion mas fuerte antes de integrar, ejecuta `npm run build`.
- Si tocas flujos Android/offline, revisa tambien `android:migration:check` y
  `sync:robustness`.
