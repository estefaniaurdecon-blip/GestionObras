# Plan de Migración Supabase -> API propia

Fecha: 2026-02-25  
Rama: `fix/docint-config-audit`

## Snapshot de alcance (congelado)

Comandos ejecutados:

```powershell
rg -n "from '@/integrations/supabase/client'" src
rg -n "supabase\.functions\.invoke\(" src
rg -n "VITE_SUPABASE"
```

Estado actual:
- Imports runtime `from '@/integrations/supabase/client'`: **50 archivos**.
- Invocaciones `supabase.functions.invoke(...)`: **3** (bloqueante).
- `VITE_SUPABASE` en `src`: **0**.
- `VITE_SUPABASE` residual fuera de `src`: `docker-compose.yml` + referencias históricas en documentación.

## Tabla de migración por feature

| Archivo(s) | Feature | Función supabase | Endpoint API nuevo propuesto | Estado |
|---|---|---|---|---|
| `src/components/AdvancedReports.tsx` | Resumen IA avanzado | `generate-summary-report` | `POST /api/v1/ai/generate-summary-report` | Migrado (2026-02-25) |
| `src/hooks/useCompanyStandardization.ts` | Estandarización de empresas | `standardize-companies` | `POST /api/v1/ai/standardize-companies` | Migrado (2026-02-25) |
| `src/components/InventoryAIAnalysis.tsx` | IA sobre inventario | `analyze-inventory` | `POST /api/v1/ai/analyze-inventory` | Bloqueante |
| `src/components/OrganizationSettings.tsx` | Detección de colores de logo | `analyze-logo-colors` | `POST /api/v1/ai/analyze-logo-colors` | Migrado (2026-02-25) |
| `src/hooks/useWorkReportImages.ts` | Análisis IA de imagen de parte | `analyze-work-image` | `POST /api/v1/ai/analyze-work-image` | Migrado (2026-02-25) |
| `src/components/WorkInventory.tsx` | Poblado/limpieza de inventario | `populate-inventory-from-reports`, `clean-inventory` | `POST /api/v1/erp/inventory/populate-from-reports`<br>`POST /api/v1/erp/inventory/clean` | Bloqueante |
| `src/utils/archivedExportUtils.ts`<br>`src/utils/exportUtils.ts`<br>`src/utils/weeklyMonthlyExportUtils.ts`<br>`src/utils/pdfGenerator.ts` | Exportaciones (datos ERP + storage) | - | `GET /api/v1/erp/exports/*` + `GET /api/v1/files/public-url` | Pendiente |
| `src/components/CompanyPortfolio.tsx` | Portfolio de empresa y relaciones | - | `GET/POST/PATCH/DELETE /api/v1/erp/company-portfolio*` | Pendiente |
| `src/components/CalendarTasks.tsx` | Tareas de calendario y recordatorios | - | `GET/POST/PATCH/DELETE /api/v1/erp/calendar-tasks*` | Pendiente |
| `src/components/HelpCenter.tsx`<br>`src/hooks/useMessages.ts`<br>`src/hooks/useMessageableUsers.ts`<br>`src/components/WorkReportComments.tsx` | Mensajería/soporte interno | - | `GET/POST/PATCH/DELETE /api/v1/messages*` | Pendiente |
| `src/components/NotificationsCenter.tsx`<br>`src/hooks/useNotifications.ts` | Notificaciones de usuario | - | `GET/POST /api/v1/notifications*` (usar endpoints FastAPI existentes y ampliar) | Pendiente |
| `src/components/OrganizationSettings.tsx`<br>`src/hooks/useOrganization.ts`<br>`src/hooks/useOrganizationLogo.ts`<br>`src/hooks/useCompanySettings.ts`<br>`src/hooks/usePublicOrganizationBranding.ts`<br>`src/components/PlatformPreferences.tsx`<br>`src/utils/imageUrlHelper.ts` | Branding/organización/storage | - | `GET/PUT /api/v1/branding/{tenant_id}` + `POST /api/v1/files/upload` + `GET /api/v1/files/public-url` | Pendiente |
| `src/components/UserManagement.tsx`<br>`src/hooks/useUsers.ts`<br>`src/contexts/UserPermissionsContext.tsx` | Usuarios, roles y permisos | - | `GET/POST/PATCH/DELETE /api/v1/users*` + `GET /api/v1/rbac/*` | Pendiente |
| `src/components/WorkReportList.tsx`<br>`src/hooks/useWorkReports.ts`<br>`src/hooks/useAssignedWorks.ts`<br>`src/hooks/useAccessControlSync.ts`<br>`src/hooks/usePhases.ts` | Partes y sincronización ERP | - | Reusar `GET/POST/PATCH/DELETE /api/v1/erp/work-reports*` y ampliar endpoints faltantes | Pendiente |
| `src/hooks/useDeliveryNotes.ts`<br>`src/hooks/useInventoryMovements.ts`<br>`src/services/rentalMachinerySource.ts`<br>`src/hooks/useRentalMachineryAssignments.ts`<br>`src/hooks/useWasteEntries.ts` | Albaranes, movimientos y maquinaria | - | `GET/POST/PATCH/DELETE /api/v1/erp/delivery-notes*`<br>`/inventory-movements*`<br>`/rental-machinery*` | Pendiente |
| `src/components/ActiveRepasosSection.tsx`<br>`src/components/ActivePostventasSection.tsx`<br>`src/hooks/useWorkRepasos.ts`<br>`src/hooks/useWorkPostventas.ts` | Repasos/Postventas | - | `GET/POST/PATCH/DELETE /api/v1/erp/repasos*` y `/postventas*` | Pendiente |
| `src/hooks/useRepasoImages.ts`<br>`src/hooks/usePostventaImages.ts`<br>`src/hooks/useWorkReportImages.ts` | Imágenes (upload + firma URL pública) | - | `POST /api/v1/files/upload` + `GET /api/v1/files/public-url` + `DELETE /api/v1/files` | Pendiente |
| `src/hooks/useSharedFiles.ts`<br>`src/hooks/useWorkReportDownloads.ts` | Archivos compartidos/descargas | - | `GET/POST/PATCH/DELETE /api/v1/files/shared*` | Pendiente |
| `src/hooks/useUpcomingDeadlines.ts` | Vencimientos próximos | - | `GET /api/v1/erp/deadlines/upcoming` | Pendiente |
| `src/components/EconomicAnalysis.tsx`<br>`src/components/EconomicManagement.tsx`<br>`src/components/SavedEconomicReports.tsx` | Gestión económica | - | `GET/POST/PATCH/DELETE /api/v1/erp/economic-reports*` | Pendiente |
| `src/hooks/useWorkRentalMachinery.ts` | Maquinaria alquilada (parte) | - | Reusar/ampliar `GET/POST/PATCH/DELETE /api/v1/erp/rental-machinery*` | Pendiente |

## Orden recomendado de ejecución
1. Migrar las 8 `supabase.functions.invoke` (bloqueante runtime crítico).
2. Migrar features de mayor tráfico de UI (`work-reports`, `users`, `branding/storage`).
3. Migrar utilidades de exportación e imágenes.
4. Cerrar con limpieza final (`rg ... == 0`) y eliminación de `src/integrations/supabase/*`.

