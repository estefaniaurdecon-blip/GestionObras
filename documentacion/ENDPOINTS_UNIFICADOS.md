# Catalogo de Endpoints

Este documento es la referencia unica y vigente de endpoints del repo.

Regla de orden: cualquier otro documento debe enlazar aqui y no duplicar listados de rutas.

## Cobertura

- Backend FastAPI detectado desde codigo: **144** endpoints (rutas `@router.*`).
- Azure Functions DocInt proxy: 1 endpoint operativo de procesado de albaranes.
- Funciones heredadas de Supabase: inventario de migracion incluido al final.

## Endpoint DocInt (Azure Functions)

| Metodo | Ruta | Servicio | Notas |
|---|---|---|---|
| POST | `/api/v1/albaranes/process` | `azure-functions/docint-proxy` | Endpoint principal de escaneo DocInt (flujo tablet -> proxy -> revision -> aplicar). |

## Backend FastAPI (/api/v1)

### Modulo `health`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/health/` | `backend-fastapi/app/api/v1/health.py` |

### Modulo `auth`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/auth/change-password` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/login` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/logout` | `backend-fastapi/app/api/v1/auth.py` |
| POST | `/api/v1/auth/mfa/verify` | `backend-fastapi/app/api/v1/auth.py` |

### Modulo `updates`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/updates/check` | `backend-fastapi/app/api/v1/updates.py` |

### Modulo `ai`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/ai/construction-chat` | `backend-fastapi/app/api/v1/ai_chat.py` |

### Modulo `ai_runtime`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/ai/generate-summary-report` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/analyze-work-image` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/analyze-logo-colors` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/standardize-companies` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/populate-inventory-from-reports` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/clean-inventory` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/analyze-inventory` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| GET | `/api/v1/ai/inventory-items` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| PATCH | `/api/v1/ai/inventory-items/{item_id}` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| DELETE | `/api/v1/ai/inventory-items/{item_id}` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/inventory/merge-suppliers` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/inventory/validate-fix` | `backend-fastapi/app/api/v1/ai_runtime.py` |
| POST | `/api/v1/ai/inventory/apply-analysis` | `backend-fastapi/app/api/v1/ai_runtime.py` |

### Modulo `branding`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/branding/{tenant_id}` | `backend-fastapi/app/api/v1/branding.py` |
| PUT | `/api/v1/branding/{tenant_id}` | `backend-fastapi/app/api/v1/branding.py` |

### Modulo `organization`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/organization/me` | `backend-fastapi/app/api/v1/organization.py` |
| PATCH | `/api/v1/organization/me` | `backend-fastapi/app/api/v1/organization.py` |
| POST | `/api/v1/organization/me/logo` | `backend-fastapi/app/api/v1/organization.py` |
| DELETE | `/api/v1/organization/me/logo` | `backend-fastapi/app/api/v1/organization.py` |
| GET | `/api/v1/users/me/preferences` | `backend-fastapi/app/api/v1/organization.py` |
| PATCH | `/api/v1/users/me/preferences` | `backend-fastapi/app/api/v1/organization.py` |

### Modulo `delivery_notes`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/delivery-notes` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| POST | `/api/v1/delivery-notes` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| PATCH | `/api/v1/delivery-notes/{note_id}` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| DELETE | `/api/v1/delivery-notes/{note_id}` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| POST | `/api/v1/delivery-notes/{note_id}/validate` | `backend-fastapi/app/api/v1/delivery_notes.py` |
| POST | `/api/v1/delivery-notes/{note_id}/reject` | `backend-fastapi/app/api/v1/delivery_notes.py` |

### Modulo `inventory_movements`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/inventory-movements` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| GET | `/api/v1/inventory-movements/kpis` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| POST | `/api/v1/inventory-movements` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| PATCH | `/api/v1/inventory-movements/{movement_id}` | `backend-fastapi/app/api/v1/inventory_movements.py` |
| DELETE | `/api/v1/inventory-movements/{movement_id}` | `backend-fastapi/app/api/v1/inventory_movements.py` |

### Modulo `attachments`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/work-reports/{work_report_id}/attachments` | `backend-fastapi/app/api/v1/attachments.py` |
| POST | `/api/v1/work-reports/{work_report_id}/attachments` | `backend-fastapi/app/api/v1/attachments.py` |
| PATCH | `/api/v1/work-reports/{work_report_id}/attachments/{attachment_id}` | `backend-fastapi/app/api/v1/attachments.py` |
| DELETE | `/api/v1/work-reports/{work_report_id}/attachments/{attachment_id}` | `backend-fastapi/app/api/v1/attachments.py` |
| POST | `/api/v1/attachments/images` | `backend-fastapi/app/api/v1/attachments.py` |
| DELETE | `/api/v1/attachments/images/by-url` | `backend-fastapi/app/api/v1/attachments.py` |
| GET | `/api/v1/shared-files` | `backend-fastapi/app/api/v1/attachments.py` |
| POST | `/api/v1/shared-files` | `backend-fastapi/app/api/v1/attachments.py` |
| GET | `/api/v1/shared-files/{shared_file_id}/download` | `backend-fastapi/app/api/v1/attachments.py` |
| POST | `/api/v1/shared-files/{shared_file_id}/mark-downloaded` | `backend-fastapi/app/api/v1/attachments.py` |
| DELETE | `/api/v1/shared-files/{shared_file_id}` | `backend-fastapi/app/api/v1/attachments.py` |

### Modulo `tenants`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/tenants/` | `backend-fastapi/app/api/v1/tenants.py` |
| POST | `/api/v1/tenants/` | `backend-fastapi/app/api/v1/tenants.py` |
| DELETE | `/api/v1/tenants/{tenant_id}` | `backend-fastapi/app/api/v1/tenants.py` |
| PUT | `/api/v1/tenants/{tenant_id}` | `backend-fastapi/app/api/v1/tenants.py` |

### Modulo `users`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/users/` | `backend-fastapi/app/api/v1/users.py` |
| GET | `/api/v1/users/by-tenant/{tenant_id}` | `backend-fastapi/app/api/v1/users.py` |
| GET | `/api/v1/users/me` | `backend-fastapi/app/api/v1/users.py` |
| PATCH | `/api/v1/users/me` | `backend-fastapi/app/api/v1/users.py` |
| POST | `/api/v1/users/me/avatar` | `backend-fastapi/app/api/v1/users.py` |
| DELETE | `/api/v1/users/{user_id}` | `backend-fastapi/app/api/v1/users.py` |
| PATCH | `/api/v1/users/{user_id}` | `backend-fastapi/app/api/v1/users.py` |
| PATCH | `/api/v1/users/{user_id}/status` | `backend-fastapi/app/api/v1/users.py` |

### Modulo `tools`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/tools/by-tenant` | `backend-fastapi/app/api/v1/tools.py` |
| GET | `/api/v1/tools/catalog` | `backend-fastapi/app/api/v1/tools.py` |
| PUT | `/api/v1/tools/{tool_id}/by-tenant/{tenant_id}` | `backend-fastapi/app/api/v1/tools.py` |
| POST | `/api/v1/tools/{tool_id}/launch` | `backend-fastapi/app/api/v1/tools.py` |

### Modulo `audit`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/audit/` | `backend-fastapi/app/api/v1/audit.py` |

### Modulo `dashboard`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/dashboard/summary` | `backend-fastapi/app/api/v1/dashboard.py` |

### Modulo `erp`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/erp/access-control-reports` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/access-control-reports` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/access-control-reports/{report_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/access-control-reports/{report_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/access-control-reports/{report_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/activities` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/activities` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/activities/{activity_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/deliverables` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/deliverables` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/deliverables/{deliverable_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/milestones` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/milestones` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/milestones/{milestone_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/projects/{project_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/projects/{project_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/budget-milestones` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/budget-milestones` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/projects/{project_id}/budget-milestones/{milestone_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/projects/{project_id}/budget-milestones/{milestone_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/budgets` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/budgets` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/projects/{project_id}/budgets/{budget_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/projects/{project_id}/budgets/{budget_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/projects/{project_id}/documents` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/projects/{project_id}/documents` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/rental-machinery` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/rental-machinery` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/rental-machinery/{machinery_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/rental-machinery/{machinery_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/reports/time` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/subactivities` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/subactivities` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/subactivities/{subactivity_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/task-templates` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/task-templates` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/tasks` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/tasks` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/tasks/{task_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/tasks/{task_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/time-sessions` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/time-sessions` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/time-sessions/{session_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/time-sessions/{session_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/time-tracking/active` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/time-tracking/start` | `backend-fastapi/app/api/v1/erp.py` |
| PUT | `/api/v1/erp/time-tracking/stop` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/work-reports` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/work-reports` | `backend-fastapi/app/api/v1/erp.py` |
| POST | `/api/v1/erp/work-reports/sync` | `backend-fastapi/app/api/v1/erp.py` |
| DELETE | `/api/v1/erp/work-reports/{report_id}` | `backend-fastapi/app/api/v1/erp.py` |
| GET | `/api/v1/erp/work-reports/{report_id}` | `backend-fastapi/app/api/v1/erp.py` |
| PATCH | `/api/v1/erp/work-reports/{report_id}` | `backend-fastapi/app/api/v1/erp.py` |

### Modulo `external_collaborations`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/erp/external-collaborations` | `backend-fastapi/app/api/v1/external_collaborations.py` |
| POST | `/api/v1/erp/external-collaborations` | `backend-fastapi/app/api/v1/external_collaborations.py` |
| DELETE | `/api/v1/erp/external-collaborations/{collaboration_id}` | `backend-fastapi/app/api/v1/external_collaborations.py` |
| PATCH | `/api/v1/erp/external-collaborations/{collaboration_id}` | `backend-fastapi/app/api/v1/external_collaborations.py` |

### Modulo `summary`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/erp/summary/{year}` | `backend-fastapi/app/api/v1/summary.py` |
| PUT | `/api/v1/erp/summary/{year}` | `backend-fastapi/app/api/v1/summary.py` |

### Modulo `simulations`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/erp/simulations` | `backend-fastapi/app/api/v1/simulations.py` |
| POST | `/api/v1/erp/simulations` | `backend-fastapi/app/api/v1/simulations.py` |
| DELETE | `/api/v1/erp/simulations/{project_id}` | `backend-fastapi/app/api/v1/simulations.py` |
| PATCH | `/api/v1/erp/simulations/{project_id}` | `backend-fastapi/app/api/v1/simulations.py` |
| POST | `/api/v1/erp/simulations/{project_id}/expenses` | `backend-fastapi/app/api/v1/simulations.py` |
| DELETE | `/api/v1/erp/simulations/{project_id}/expenses/{expense_id}` | `backend-fastapi/app/api/v1/simulations.py` |
| PATCH | `/api/v1/erp/simulations/{project_id}/expenses/{expense_id}` | `backend-fastapi/app/api/v1/simulations.py` |

### Modulo `tickets`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/tickets/` | `backend-fastapi/app/api/v1/tickets.py` |
| POST | `/api/v1/tickets/` | `backend-fastapi/app/api/v1/tickets.py` |
| GET | `/api/v1/tickets/{ticket_id}` | `backend-fastapi/app/api/v1/tickets.py` |
| PATCH | `/api/v1/tickets/{ticket_id}` | `backend-fastapi/app/api/v1/tickets.py` |
| POST | `/api/v1/tickets/{ticket_id}/assign` | `backend-fastapi/app/api/v1/tickets.py` |
| POST | `/api/v1/tickets/{ticket_id}/close` | `backend-fastapi/app/api/v1/tickets.py` |
| GET | `/api/v1/tickets/{ticket_id}/messages` | `backend-fastapi/app/api/v1/tickets.py` |
| POST | `/api/v1/tickets/{ticket_id}/messages` | `backend-fastapi/app/api/v1/tickets.py` |
| POST | `/api/v1/tickets/{ticket_id}/reopen` | `backend-fastapi/app/api/v1/tickets.py` |

### Modulo `hr`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/hr/allocations` | `backend-fastapi/app/api/v1/hr.py` |
| POST | `/api/v1/hr/allocations` | `backend-fastapi/app/api/v1/hr.py` |
| DELETE | `/api/v1/hr/allocations/{allocation_id}` | `backend-fastapi/app/api/v1/hr.py` |
| PATCH | `/api/v1/hr/allocations/{allocation_id}` | `backend-fastapi/app/api/v1/hr.py` |
| GET | `/api/v1/hr/departments` | `backend-fastapi/app/api/v1/hr.py` |
| POST | `/api/v1/hr/departments` | `backend-fastapi/app/api/v1/hr.py` |
| PATCH | `/api/v1/hr/departments/{dept_id}` | `backend-fastapi/app/api/v1/hr.py` |
| GET | `/api/v1/hr/employees` | `backend-fastapi/app/api/v1/hr.py` |
| POST | `/api/v1/hr/employees` | `backend-fastapi/app/api/v1/hr.py` |
| DELETE | `/api/v1/hr/employees/{profile_id}` | `backend-fastapi/app/api/v1/hr.py` |
| PATCH | `/api/v1/hr/employees/{profile_id}` | `backend-fastapi/app/api/v1/hr.py` |
| GET | `/api/v1/hr/reports/headcount` | `backend-fastapi/app/api/v1/hr.py` |

### Modulo `invitations`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/invitations` | `backend-fastapi/app/api/v1/invitations.py` |
| POST | `/api/v1/invitations/accept` | `backend-fastapi/app/api/v1/invitations.py` |
| GET | `/api/v1/invitations/validate` | `backend-fastapi/app/api/v1/invitations.py` |

### Modulo `notifications`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/notifications` | `backend-fastapi/app/api/v1/notifications.py` |
| POST | `/api/v1/notifications/read-all` | `backend-fastapi/app/api/v1/notifications.py` |
| POST | `/api/v1/notifications/{notification_id}/read` | `backend-fastapi/app/api/v1/notifications.py` |
| DELETE | `/api/v1/notifications/{notification_id}` | `backend-fastapi/app/api/v1/notifications.py` |

### Modulo `messages`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/messages` | `backend-fastapi/app/api/v1/messages.py` |
| POST | `/api/v1/messages` | `backend-fastapi/app/api/v1/messages.py` |
| POST | `/api/v1/messages/{message_id}/read` | `backend-fastapi/app/api/v1/messages.py` |
| DELETE | `/api/v1/messages/conversation/{other_user_id}` | `backend-fastapi/app/api/v1/messages.py` |
| DELETE | `/api/v1/messages/clear-all` | `backend-fastapi/app/api/v1/messages.py` |

### Modulo `invoices`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/invoices` | `backend-fastapi/app/invoices/router.py` |
| GET | `/api/v1/invoices` | `backend-fastapi/app/invoices/router.py` |
| GET | `/api/v1/invoices/{invoice_id}` | `backend-fastapi/app/invoices/router.py` |
| GET | `/api/v1/invoices/{invoice_id}/download` | `backend-fastapi/app/invoices/router.py` |
| PATCH | `/api/v1/invoices/{invoice_id}` | `backend-fastapi/app/invoices/router.py` |
| POST | `/api/v1/invoices/{invoice_id}/mark-paid` | `backend-fastapi/app/invoices/router.py` |
| DELETE | `/api/v1/invoices/{invoice_id}` | `backend-fastapi/app/invoices/router.py` |
| POST | `/api/v1/invoices/{invoice_id}/reprocess` | `backend-fastapi/app/invoices/router.py` |

### Modulo `contracts`

| Metodo | Ruta | Fuente |
|---|---|---|
| GET | `/api/v1/contracts` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts` | `backend-fastapi/app/contracts/router.py` |
| GET | `/api/v1/contracts/suppliers/lookup` | `backend-fastapi/app/contracts/router.py` |
| GET | `/api/v1/contracts/{contract_id}` | `backend-fastapi/app/contracts/router.py` |
| PATCH | `/api/v1/contracts/{contract_id}` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts/{contract_id}/approve` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts/{contract_id}/generate-docs` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts/{contract_id}/offers` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts/{contract_id}/reject` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts/{contract_id}/select-offer` | `backend-fastapi/app/contracts/router.py` |
| POST | `/api/v1/contracts/{contract_id}/submit-gerencia` | `backend-fastapi/app/contracts/router.py` |

### Modulo `internal`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/api/v1/internal/notifications` | `backend-fastapi/app/api/v1/internal.py` |

### Modulo `contracts_public`

| Metodo | Ruta | Fuente |
|---|---|---|
| POST | `/public/sign/{token}` | `backend-fastapi/app/contracts/router.py` |
| GET | `/public/supplier-onboarding/{token}` | `backend-fastapi/app/contracts/router.py` |
| POST | `/public/supplier-onboarding/{token}` | `backend-fastapi/app/contracts/router.py` |

## Funciones heredadas de Supabase (estado de migracion)

| Funcion heredada | Estado | Endpoint API destino | Consumidor |
|---|---|---|---|
| `check-updates` | Migrado | `POST /api/v1/updates/check` | `apps/construction-log/.../useAppUpdates.ts` |
| `construction-chat` | Migrado (modo seguro) | `POST /api/v1/ai/construction-chat` | `apps/construction-log/.../AIAssistantChat.tsx` |
| `generate-summary-report` | Migrado | `POST /api/v1/ai/generate-summary-report` | `apps/construction-log/.../AdvancedReports.tsx` |
| `standardize-companies` | Migrado | `POST /api/v1/ai/standardize-companies` | `apps/construction-log/.../useCompanyStandardization.ts` |
| `analyze-inventory` | Migrado | `POST /api/v1/ai/analyze-inventory` | `apps/construction-log/.../InventoryAIAnalysis.tsx` |
| `analyze-work-image` | Migrado | `POST /api/v1/ai/analyze-work-image` | `apps/construction-log/.../useWorkReportImages.ts` |
| `analyze-logo-colors` | Migrado | `POST /api/v1/ai/analyze-logo-colors` | `apps/construction-log/.../OrganizationSettings.tsx` |
| `populate-inventory-from-reports` | Migrado | `POST /api/v1/ai/populate-inventory-from-reports` | `apps/construction-log/.../WorkInventory.tsx` |
| `clean-inventory` | Migrado | `POST /api/v1/ai/clean-inventory` | `apps/construction-log/.../WorkInventory.tsx` |

## Norma de mantenimiento

1. No publicar listados de rutas en otros `.md`/`.txt` del repo.
2. Si cambia una ruta, actualizar primero este catalogo.
3. Los demas documentos solo pueden enlazar a este archivo para temas de endpoints.
