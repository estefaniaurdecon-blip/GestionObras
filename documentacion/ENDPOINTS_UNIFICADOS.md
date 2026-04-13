# Catalogo de Endpoints Unificados

Este documento es la referencia vigente de endpoints del repo y esta revisado desde la perspectiva de la app `construction-log`.
Sirve para distinguir que consume realmente tu app, que endpoints son compartidos de plataforma y que bloques parecen pertenecer a otras funcionalidades del repo.

Para decidir que se puede extraer o eliminar con seguridad, complementar con [ANALISIS_DEPURACION_ENDPOINTS.md](./ANALISIS_DEPURACION_ENDPOINTS.md).

Nota operativa: `contracts` e `invoices` ya se han extraido del backend de este repo. Los routers legacy que siguen disponibles solo bajo flag son `audit`, `tickets`, `hr` e `invitations`, via `ENABLE_LEGACY_NON_APP_ROUTERS=true`.

## Resumen ejecutivo

- Backend FastAPI detectado desde las rutas reales: **206** endpoints.
- Azure Functions DocInt proxy: **1** endpoint HTTP operativo.
- Endpoints nucleo de `construction-log`: **124**.
- Endpoints compartidos de plataforma usados por `construction-log`: **43**.
- Endpoints de plataforma sin uso detectado en `construction-log`: **3**.
- Endpoints internos o de automatizacion: **2**.
- Endpoints sin uso detectado en `construction-log` y candidatos a pertenecer a otras funcionalidades: **35**.

## Como leer este catalogo

- `Nucleo construction-log`: endpoint consumido por la app y alineado con sus modulos funcionales actuales.
- `Compartido de plataforma`: endpoint usado por tu app, pero de caracter transversal como auth, tenants, usuarios, branding o mensajeria.
- `Plataforma del repo sin uso en esta app`: capacidad disponible en backend, pero sin consumo directo detectado en el frontend actual.
- `Interno / automatizacion`: pensado para integraciones internas, jobs o backoffice, no para la UI de tu app.
- `Otra funcionalidad del repo / revisar`: no hay uso detectado en `construction-log`; puede pertenecer a otro flujo del producto o a funcionalidad pendiente de integrar.
- La deteccion de uso se basa en referencias directas encontradas en `apps/construction-log/construction-log-supabase-local/src`; rutas construidas de forma muy dinamica pueden requerir revision manual.

## Bloques a revisar por ownership

| Area | Endpoints | Lectura recomendada |
|---|---:|---|
| ERP Core | 22 | ERP Core mezcla endpoints nucleares de la app y otros subdominios aun no conectados o pertenecientes a otros flujos. |
| Simulations | 7 | Sin referencias detectadas desde construction-log; revisar si corresponde mantenerlo en este repo o documentarlo como compartido. |
| Company Portfolio | 4 | Sin referencias detectadas desde construction-log; revisar si corresponde mantenerlo en este repo o documentarlo como compartido. |
| Tenants | 2 | Sin referencias detectadas desde construction-log; revisar si corresponde mantenerlo en este repo o documentarlo como compartido. |
| External Collaborations | 2 | Sin referencias detectadas desde construction-log; revisar si corresponde mantenerlo en este repo o documentarlo como compartido. |
| Internal | 2 | Uso interno entre servicios o automatizaciones; no debe tratarse como UI de construction-log. |
| Users | 1 | Sin referencias detectadas desde construction-log; revisar si corresponde mantenerlo en este repo o documentarlo como compartido. |

## Endpoints

### Azure Functions

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/albaranes/process` | Procesar albaranes con Azure AI Document Intelligence y devolver JSON normalizado para revision o importacion | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/useAlbaranScanController.ts` | `azure-functions/docint-proxy/src/functions/processAlbaran.ts` |

### Health

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/health/` | Health check de la API | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/components/WorkReportsTab.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/components/api/ProfileSettingsPanel.tsx` | `backend-fastapi/app/api/v1/health.py` |

### Auth

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/change-password` | Cambiar contraseña del propio usuario | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/forgot-password` | Solicitar enlace de recuperación de contraseña | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/login` | Login con usuario y contraseña | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/logout` | Cerrar sesion y limpiar cookie | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/mfa/verify` | Verificación MFA (TOTP) | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/refresh` | Renovar sesión automática de SUPER_ADMIN | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/reset-password` | Confirmar nueva contraseña con el token recibido | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/auth.py` |

### Branding

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/branding/{tenant_id}` | Obtener branding de un tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/branding.py` |
| PUT | `/api/v1/branding/{tenant_id}` | Actualizar branding de un tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/branding.py` |

### Updates

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/updates/check` | Comprobar actualizaciones disponibles | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/updates.py` |

### AI

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/ai/analyze-inventory` | Analizar inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/analyze-logo-colors` | Analizar colores de logotipo | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/analyze-work-image` | Analizar imagen de obra | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/clean-inventory` | Limpiar inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/construction-chat` | Chat de construccion deshabilitado | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/components/AIAssistantChat.tsx` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/generate-summary-report` | Generar resumen consolidado | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/help-chat` | Asistente de ayuda | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/useAiHelpConversation.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| GET | `/api/v1/ai/inventory-items` | Listar items de inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| DELETE | `/api/v1/ai/inventory-items/{item_id}` | Eliminar item de inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| PATCH | `/api/v1/ai/inventory-items/{item_id}` | Actualizar item de inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/inventory/apply-analysis` | Apply inventory analysis | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/inventory/merge-suppliers` | Fusionar proveedores duplicados de inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/inventory/validate-fix` | Validar y corregir inventario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/populate-inventory-from-reports` | Poblar inventario desde partes | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/standardize-companies` | Estandarizar nombres de empresas | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/aiRuntime.ts` | `backend-fastapi/app/api/v1/ai_chat.py + backend-fastapi/app/api/v1/ai_runtime.py` |

### Delivery Notes

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/delivery-notes` | Listar delivery notes | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| POST | `/api/v1/delivery-notes` | Crear delivery note | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| DELETE | `/api/v1/delivery-notes/{note_id}` | Eliminar delivery note | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| PATCH | `/api/v1/delivery-notes/{note_id}` | Actualizar delivery note | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| POST | `/api/v1/delivery-notes/{note_id}/reject` | Rechazar delivery note | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| POST | `/api/v1/delivery-notes/{note_id}/validate` | Validar delivery note | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/delivery_notes.py` |

### Inventory Movements

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/inventory-movements` | Listar inventory movements | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| POST | `/api/v1/inventory-movements` | Crear inventory movement | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| GET | `/api/v1/inventory-movements/kpis` | Obtener inventory kpis | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| DELETE | `/api/v1/inventory-movements/{movement_id}` | Eliminar inventory movement | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| PATCH | `/api/v1/inventory-movements/{movement_id}` | Actualizar inventory movement | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/inventory_movements.py` |

### Attachments

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/attachments/images` | Subir generic image | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| DELETE | `/api/v1/attachments/images/by-url` | Eliminar generic image by url | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| GET | `/api/v1/shared-files` | Listar shared files | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/messagingOfflineStore.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| POST | `/api/v1/shared-files` | Crear shared file | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/messagingOfflineStore.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| DELETE | `/api/v1/shared-files/{shared_file_id}` | Eliminar shared file | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/messagingOfflineStore.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| GET | `/api/v1/shared-files/{shared_file_id}/download` | Descargar shared file | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| POST | `/api/v1/shared-files/{shared_file_id}/mark-downloaded` | Marcar shared file downloaded | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| GET | `/api/v1/work-reports/images/{file_path:path}` | Servir work report image | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/components/AuthenticatedImage.tsx` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| GET | `/api/v1/work-reports/{work_report_id}/attachments` | Listar work report attachments | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| POST | `/api/v1/work-reports/{work_report_id}/attachments` | Crear work report attachment | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| DELETE | `/api/v1/work-reports/{work_report_id}/attachments/{attachment_id}` | Eliminar work report attachment | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| PATCH | `/api/v1/work-reports/{work_report_id}/attachments/{attachment_id}` | Actualizar work report attachment | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/attachments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| GET | `/api/v1/work-reports/{work_report_id}/comments` | Listar comentarios de un parte | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workReportComments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |
| POST | `/api/v1/work-reports/{work_report_id}/comments` | Crear comentario en un parte | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workReportComments.ts` | `backend-fastapi/app/api/v1/attachments.py + backend-fastapi/app/api/v1/work_report_comments.py` |

### Organization

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/organization/me` | Obtener my organization | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/organization.py` |
| PATCH | `/api/v1/organization/me` | Actualizar my organization | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/organization.py` |
| DELETE | `/api/v1/organization/me/logo` | Eliminar my organization logo | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/organization.py` |
| POST | `/api/v1/organization/me/logo` | Subir my organization logo | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/organization.py` |
| GET | `/api/v1/users/me/preferences` | Obtener my user preferences | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/organization.py` |
| PATCH | `/api/v1/users/me/preferences` | Actualizar my user preferences | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts` | `backend-fastapi/app/api/v1/organization.py` |

### Tenants

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tenants/` | Listar tenants | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/tenants.py` |
| POST | `/api/v1/tenants/` | Crear tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/tenants.py` |
| DELETE | `/api/v1/tenants/{tenant_id}` | Eliminar tenant | Plataforma del repo sin uso en esta app | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/tenants.py` |
| PUT | `/api/v1/tenants/{tenant_id}` | Editar tenant | Plataforma del repo sin uso en esta app | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/tenants.py` |

### Users

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/users/` | Crear usuario (global o por tenant) | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/components/TaskCalendarView.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/contexts/AuthContext.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`... (+3 mas)` | `backend-fastapi/app/api/v1/users.py` |
| GET | `/api/v1/users/by-tenant/{tenant_id}` | Listar usuarios de un tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/users.py` |
| GET | `/api/v1/users/contacts/autocomplete/by-tenant/{tenant_id}` | Autocomplete de usuarios normales de un tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/users.py` |
| GET | `/api/v1/users/contacts/by-tenant/{tenant_id}` | Listar contactos activos de un tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/users.py` |
| GET | `/api/v1/users/me` | Información del usuario autenticado | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/contexts/AuthContext.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts`<br>`... (+1 mas)` | `backend-fastapi/app/api/v1/users.py` |
| PATCH | `/api/v1/users/me` | Actualizar perfil del usuario autenticado | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/contexts/AuthContext.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts`<br>`... (+1 mas)` | `backend-fastapi/app/api/v1/users.py` |
| POST | `/api/v1/users/me/avatar` | Subir foto de perfil | Plataforma del repo sin uso en esta app | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/users.py` |
| DELETE | `/api/v1/users/{user_id}` | Eliminar usuario | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/contexts/AuthContext.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts`<br>`... (+2 mas)` | `backend-fastapi/app/api/v1/users.py` |
| PATCH | `/api/v1/users/{user_id}` | Editar usuario | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/contexts/AuthContext.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/organization.ts`<br>`... (+2 mas)` | `backend-fastapi/app/api/v1/users.py` |
| PATCH | `/api/v1/users/{user_id}/status` | Activar o desactivar usuario | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/users.ts` | `backend-fastapi/app/api/v1/users.py` |

### User Management

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/user-management/assignable-foremen` | Listar capataces asignables | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| DELETE | `/api/v1/erp/user-management/assignments` | Eliminar asignacion usuario-obra | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| POST | `/api/v1/erp/user-management/assignments` | Asignar usuario a obra | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| GET | `/api/v1/erp/user-management/users` | Listar usuarios del tenant | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| DELETE | `/api/v1/erp/user-management/users/{user_id}` | Eliminar user and data | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| POST | `/api/v1/erp/user-management/users/{user_id}/approve` | Aprobar usuario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| GET | `/api/v1/erp/user-management/users/{user_id}/assignments` | Listar asignaciones de obras de un usuario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| GET | `/api/v1/erp/user-management/users/{user_id}/roles` | Listar roles de app de un usuario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| POST | `/api/v1/erp/user-management/users/{user_id}/roles` | Agregar rol de app a un usuario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |
| DELETE | `/api/v1/erp/user-management/users/{user_id}/roles/{role}` | Eliminar rol de app de un usuario | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/user_management.py` |

### Tools

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/tools/by-tenant` | Herramientas asignadas al tenant actual | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tools.ts` | `backend-fastapi/app/api/v1/tools.py` |
| GET | `/api/v1/tools/catalog` | Catálogo global de herramientas | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tools.ts` | `backend-fastapi/app/api/v1/tools.py` |
| PUT | `/api/v1/tools/{tool_id}/by-tenant/{tenant_id}` | Habilitar o deshabilitar una herramienta para un tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tools.ts` | `backend-fastapi/app/api/v1/tools.py` |
| POST | `/api/v1/tools/{tool_id}/launch` | Generar URL de lanzamiento SSO para una herramienta (ej. Moodle) | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tools.ts` | `backend-fastapi/app/api/v1/tools.py` |

### Dashboard

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | Resumen de métricas para el dashboard | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/dashboard.py` |

### ERP Core

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/access-control-reports` | Listar access control reports | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/access-control-reports` | Crear access control report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/access-control-reports/{report_id}` | Eliminar access control report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/access-control-reports/{report_id}` | Obtener access control report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/access-control-reports/{report_id}` | Actualizar access control report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/activities` | Listar activities | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/activities` | Crear activity | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/activities/{activity_id}` | Actualizar activity | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/deliverables` | Listar deliverables | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/deliverables` | Crear deliverable | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/deliverables/{deliverable_id}` | Actualizar deliverable | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/milestones` | Listar milestones | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/milestones` | Crear milestone | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/milestones/{milestone_id}` | Actualizar milestone | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects` | Listar projects | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/useWorks.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts`<br>`... (+1 mas)` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects` | Crear project | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/hooks/useWorks.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts`<br>`... (+1 mas)` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/member-directory` | Listar project message directory | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/projects/{project_id}` | Eliminar project | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}` | Obtener project | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/projects/{project_id}` | Actualizar project | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/broadcast-message` | Broadcast message to project | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/budget-milestones` | Listar project budget milestones | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/budget-milestones` | Crear project budget milestone | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/projects/{project_id}/budget-milestones/{milestone_id}` | Eliminar project budget milestone | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/projects/{project_id}/budget-milestones/{milestone_id}` | Actualizar project budget milestone | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/budgets` | Listar project budgets | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/budgets` | Crear project budget line | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/projects/{project_id}/budgets/{budget_id}` | Eliminar project budget line | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/projects/{project_id}/budgets/{budget_id}` | Actualizar project budget line | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/conversation` | Obtener project conversation shell | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/conversation/messages` | Listar project conversation messages | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/conversation/messages` | Crear project conversation message | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/documents` | Listar project documents | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/documents` | Subir project document | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/members` | Listar project members | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/userManagement.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/rental-machinery` | Listar rental machinery | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachinery.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachineryAssignments.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/rental-machinery` | Crear rental machinery | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachinery.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachineryAssignments.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/rental-machinery/{machinery_id}` | Eliminar rental machinery | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachinery.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/rental-machinery/{machinery_id}` | Actualizar rental machinery | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachinery.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/reports/time` | Time report | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/subactivities` | Listar subactivities | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/subactivities` | Crear subactivity | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/subactivities/{subactivity_id}` | Actualizar subactivity | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/task-templates` | Listar task templates | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/task-templates` | Crear task template | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/tasks` | Listar tasks | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tasks.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/tasks` | Crear task | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tasks.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/tasks/{task_id}` | Eliminar task | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tasks.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/tasks/{task_id}` | Actualizar task | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/tasks.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/time-sessions` | Listar time sessions | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/time-sessions` | Crear time session | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/time-sessions/{session_id}` | Eliminar time session | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/time-sessions/{session_id}` | Actualizar time session | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/time-tracking/active` | Obtener active time session | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/time-tracking/start` | Iniciar time session | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| PUT | `/api/v1/erp/time-tracking/stop` | Detener time session | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/work-postventas` | Listar work postventas | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workPostventas.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/work-postventas` | Crear work postventa | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workPostventas.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/work-postventas/{postventa_id}` | Eliminar work postventa | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workPostventas.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/work-postventas/{postventa_id}` | Actualizar work postventa | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workPostventas.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/work-repasos` | Listar work repasos | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workRepasos.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/work-repasos` | Crear work repaso | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workRepasos.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/work-repasos/{repaso_id}` | Eliminar work repaso | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workRepasos.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/work-repasos/{repaso_id}` | Actualizar work repaso | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/workRepasos.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/work-reports` | Listar work reports | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncPullService.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncTransportService.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/work-reports` | Crear work report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncPullService.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncTransportService.ts` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/work-reports/sync` | Sync work reports | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/sync/syncTransportService.ts` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/work-reports/{report_id}` | Eliminar work report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncTransportService.ts` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/work-reports/{report_id}` | Obtener work report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncTransportService.ts` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/work-reports/{report_id}` | Actualizar work report | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/sync/syncTransportService.ts` | `backend-fastapi/app/api/v1/erp.py` |

### Custom Holidays

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/custom-holidays` | Listar festivos personalizados | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/customHolidays.ts` | `backend-fastapi/app/api/v1/custom_holidays.py` |
| POST | `/api/v1/erp/custom-holidays` | Crear festivo personalizado | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/customHolidays.ts` | `backend-fastapi/app/api/v1/custom_holidays.py` |
| DELETE | `/api/v1/erp/custom-holidays/{holiday_id}` | Eliminar festivo personalizado | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/customHolidays.ts` | `backend-fastapi/app/api/v1/custom_holidays.py` |
| PATCH | `/api/v1/erp/custom-holidays/{holiday_id}` | Actualizar festivo personalizado | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/customHolidays.ts` | `backend-fastapi/app/api/v1/custom_holidays.py` |

### Phases

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/phases` | Listar fases | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/phases.ts` | `backend-fastapi/app/api/v1/phases.py` |
| POST | `/api/v1/erp/phases` | Crear fase | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/phases.ts` | `backend-fastapi/app/api/v1/phases.py` |
| DELETE | `/api/v1/erp/phases/{phase_id}` | Eliminar fase | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/phases.ts` | `backend-fastapi/app/api/v1/phases.py` |
| PATCH | `/api/v1/erp/phases/{phase_id}` | Actualizar fase | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/phases.ts` | `backend-fastapi/app/api/v1/phases.py` |
| GET | `/api/v1/erp/phases/{phase_id}/has-children` | Comprobar si una fase tiene partes asociados | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/phases.ts` | `backend-fastapi/app/api/v1/phases.py` |

### Rental Machinery Assignments

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/rental-machinery-assignments` | Listar asignaciones de operadores | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachineryAssignments.ts` | `backend-fastapi/app/api/v1/rental_machinery_assignments.py` |
| POST | `/api/v1/erp/rental-machinery-assignments` | Crear asignacion de operador | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachineryAssignments.ts` | `backend-fastapi/app/api/v1/rental_machinery_assignments.py` |
| DELETE | `/api/v1/erp/rental-machinery-assignments/{assignment_id}` | Eliminar asignacion de operador | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachineryAssignments.ts` | `backend-fastapi/app/api/v1/rental_machinery_assignments.py` |
| PATCH | `/api/v1/erp/rental-machinery-assignments/{assignment_id}` | Actualizar asignacion de operador | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/rentalMachineryAssignments.ts` | `backend-fastapi/app/api/v1/rental_machinery_assignments.py` |

### External Collaborations

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/external-collaborations` | Listar external collaborations | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts` | `backend-fastapi/app/api/v1/external_collaborations.py` |
| POST | `/api/v1/erp/external-collaborations` | Crear external collaboration | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts` | `backend-fastapi/app/api/v1/external_collaborations.py` |
| DELETE | `/api/v1/erp/external-collaborations/{collaboration_id}` | Eliminar external collaboration | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/external_collaborations.py` |
| PATCH | `/api/v1/erp/external-collaborations/{collaboration_id}` | Actualizar external collaboration | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/external_collaborations.py` |

### Company Portfolio

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/company-portfolio` | Listar cartera de empresas | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts` | `backend-fastapi/app/api/v1/company_portfolio.py` |
| POST | `/api/v1/erp/company-portfolio` | Crear empresa en cartera | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts` | `backend-fastapi/app/api/v1/company_portfolio.py` |
| DELETE | `/api/v1/erp/company-portfolio/{company_id}` | Eliminar company portfolio item | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/company_portfolio.py` |
| PATCH | `/api/v1/erp/company-portfolio/{company_id}` | Actualizar empresa | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/company_portfolio.py` |
| GET | `/api/v1/erp/company-types` | Listar tipos de empresa | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts` | `backend-fastapi/app/api/v1/company_portfolio.py` |
| POST | `/api/v1/erp/company-types` | Crear tipo de empresa | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts` | `backend-fastapi/app/api/v1/company_portfolio.py` |
| DELETE | `/api/v1/erp/company-types/{type_name}` | Eliminar company type | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/company_portfolio.py` |
| PATCH | `/api/v1/erp/company-types/{type_name}` | Renombrar tipo de empresa | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/company_portfolio.py` |

### Messages

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/messages` | Listar mensajes del usuario actual | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/messages.ts` | `backend-fastapi/app/api/v1/messages.py` |
| POST | `/api/v1/messages` | Enviar un mensaje | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts`<br>`apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/messages.ts` | `backend-fastapi/app/api/v1/messages.py` |
| DELETE | `/api/v1/messages/clear-all` | Eliminar todos los mensajes del usuario actual | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/messages.ts` | `backend-fastapi/app/api/v1/messages.py` |
| DELETE | `/api/v1/messages/conversation/{other_user_id}` | Eliminar todos los mensajes de una conversacion | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/messages.ts` | `backend-fastapi/app/api/v1/messages.py` |
| DELETE | `/api/v1/messages/{message_id}` | Eliminar un mensaje | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/messages.ts` | `backend-fastapi/app/api/v1/messages.py` |
| POST | `/api/v1/messages/{message_id}/read` | Marcar mensaje como leido | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/messages.ts` | `backend-fastapi/app/api/v1/messages.py` |

### Notifications

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | Listar notificaciones del usuario actual | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/components/NotificationsCenter.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/components/messaging/ConversationDetailPanel.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/components/messaging/ConversationListPanel.tsx`<br>`... (+8 mas)` | `backend-fastapi/app/api/v1/notifications.py` |
| POST | `/api/v1/notifications` | Crear notificación para un usuario del tenant | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/components/NotificationsCenter.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/components/messaging/ConversationDetailPanel.tsx`<br>`apps/construction-log/construction-log-supabase-local/src/components/messaging/ConversationListPanel.tsx`<br>`... (+8 mas)` | `backend-fastapi/app/api/v1/notifications.py` |
| POST | `/api/v1/notifications/read-all` | Marcar todas las notificaciones como leídas | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/notifications.ts` | `backend-fastapi/app/api/v1/notifications.py` |
| DELETE | `/api/v1/notifications/{notification_id}` | Eliminar una notificación del usuario actual | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/notifications.ts` | `backend-fastapi/app/api/v1/notifications.py` |
| POST | `/api/v1/notifications/{notification_id}/read` | Marcar una notificación como leída | Compartido de plataforma | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/notifications.ts` | `backend-fastapi/app/api/v1/notifications.py` |

### Internal

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| POST | `/api/v1/internal/jobs/auto-duplicate-rental-machinery` | Schedule auto duplicate rental machinery | Interno / automatizacion | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/internal.py` |
| POST | `/api/v1/internal/notifications` | Crear notification | Interno / automatizacion | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/internal.py` |

### Summary

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/summary/{year}` | Read summary | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/summary.py` |
| PUT | `/api/v1/erp/summary/{year}` | Actualizar summary | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts` | `backend-fastapi/app/api/v1/summary.py` |

### Simulations

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/simulations` | Listar simulations | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |
| POST | `/api/v1/erp/simulations` | Crear simulation project | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |
| DELETE | `/api/v1/erp/simulations/{project_id}` | Eliminar simulation project | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |
| PATCH | `/api/v1/erp/simulations/{project_id}` | Actualizar simulation project | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |
| POST | `/api/v1/erp/simulations/{project_id}/expenses` | Crear simulation expense | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |
| DELETE | `/api/v1/erp/simulations/{project_id}/expenses/{expense_id}` | Eliminar simulation expense | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |
| PATCH | `/api/v1/erp/simulations/{project_id}/expenses/{expense_id}` | Actualizar simulation expense | Otra funcionalidad del repo / revisar | Sin referencia directa en construction-log | ? | `backend-fastapi/app/api/v1/simulations.py` |

### Saved Economic Reports

| Metodo | Ruta | Para que se usa | Pertinencia para construction-log | Uso actual | Consumidor detectado | Fuente |
|---|---|---|---|---|---|---|
| GET | `/api/v1/erp/saved-economic-reports` | Listar reportes economicos guardados | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/savedEconomicReports.ts` | `backend-fastapi/app/api/v1/saved_economic_reports.py` |
| POST | `/api/v1/erp/saved-economic-reports` | Crear o actualizar reporte economico guardado (upsert por work_report_id) | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/savedEconomicReports.ts` | `backend-fastapi/app/api/v1/saved_economic_reports.py` |
| DELETE | `/api/v1/erp/saved-economic-reports/{report_id}` | Eliminar reporte economico guardado | Nucleo construction-log | Uso detectado en construction-log | `apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/savedEconomicReports.ts` | `backend-fastapi/app/api/v1/saved_economic_reports.py` |
