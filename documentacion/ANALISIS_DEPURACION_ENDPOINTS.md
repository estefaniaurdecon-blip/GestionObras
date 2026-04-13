# Analisis para Depuracion de Endpoints

Este documento complementa [ENDPOINTS_UNIFICADOS.md](./ENDPOINTS_UNIFICADOS.md) y esta orientado a una pregunta distinta:

> Que endpoints podemos sacar de este proyecto para dejar solo lo que necesita `construction-log`, sin romper la app ni romper otros flujos del repo.

## Conclusiones rapidas

- No conviene borrar endpoints directamente por ausencia de uso en frontend.
- Hay modulos enteros que no consume `construction-log`, pero siguen teniendo dependencias de backend, tests o enlaces publicos.
- El candidato real a limpieza no es "endpoint suelto", sino "bloque funcional completo" con su router, servicios, modelos, workers y tests.
- `ERP` y `HR` no se pueden podar a ciegas porque tienen dependencias cruzadas.
- Desde esta refactorizacion, `contracts` e `invoices` ya han sido extraidos del backend de este repo.
- Los routers legacy que siguen despublicados por defecto y solo se exponen con `ENABLE_LEGACY_NON_APP_ROUTERS=true` son `audit`, `tickets`, `hr` e `invitations`.

## Lo que si pertenece al nucleo de construction-log

Debe quedarse en este proyecto salvo que se extraiga toda la app a otro backend:

- Auth, health, branding, updates, organization, users, user-management, messages, notifications, tools y tenants base.
- AI runtime y AI chat usados por la app.
- Delivery notes, inventory movements, attachments, work report comments y Azure DocInt.
- ERP operativo usado por la app: proyectos, partes, rental machinery, tareas, phases, access control, saved economic reports, summaries y modulos economicos conectados.
- Company portfolio y external collaborations se usan desde frontend mediante fallback entre ambas APIs.

Evidencia:

- El frontend centraliza consumo API en [client.ts](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/apps/construction-log/construction-log-supabase-local/src/integrations/api/client.ts).
- `companyPortfolio` usa tanto `/api/v1/erp/company-portfolio` como `/api/v1/erp/external-collaborations` como fallback en [companyPortfolio.ts](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/apps/construction-log/construction-log-supabase-local/src/integrations/api/modules/companyPortfolio.ts).

## Bloques que no usa construction-log pero no se deben borrar a ciegas

### Contracts e Invoices

Estos dos dominios ya no forman parte del backend activo de este repo.

- Sus routers, modelos, servicios y workers se han retirado del arbol.
- Ya no aparecen en la API montada ni en el registro de modelos SQLModel.
- El siguiente trabajo sobre ellos, si hiciera falta, ya seria fuera de este repo o desde un historial anterior.

### Tickets

No lo usa la app, pero no esta aislado del todo.

- Tiene router y servicio propios.
- Sigue cubierto por tests intensivos en [test_tickets_and_dashboard.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/tests/test_tickets_and_dashboard.py).
- El dashboard agrega metricas de tickets en [dashboard_service.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/app/services/dashboard_service.py).

Lectura: si se elimina tickets, hay que rediseñar antes el dashboard para que no dependa de ese dominio.

### Invitations

No hay uso detectado en la app, pero sigue siendo funcionalidad de plataforma con tests en [test_user_invitations.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/tests/test_user_invitations.py).

Lectura: posible extraer o desactivar, pero con decision de producto, no como limpieza tecnica automatica.

### Internal

No es UI de la app, pero esta pensado para automatizaciones y procesos internos.

- Endpoint job en [internal.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/app/api/v1/internal.py).
- Cobertura en [test_internal_jobs_autoclone.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/tests/test_internal_jobs_autoclone.py).

Lectura: si se quita, hay que validar antes si sigue habiendo jobs externos o cron invocandolo.

## Bloques peligrosos de tocar aunque no tenga consumo frontend directo

### HR

`construction-log` no llama hoy a los endpoints `hr/*`, pero `HR` no es independiente.

- `ERP` valida `department_id` usando `Department` en [erp_service.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/app/services/erp_service.py).
- Contratos usa departamentos y perfiles de empleados para destinatarios en [contracts/notifications.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/app/contracts/notifications.py).
- Ya hay tests de proyecto que crean departamentos HR para cubrir `department_id` en [test_erp_projects_api.py](/c:/Users/pinnovacion/Desktop/rutas/Saas-Multi-Tenant-main/Saas-Multi-Tenant-main/backend-fastapi/tests/test_erp_projects_api.py).

Lectura: hoy no es seguro extraer `HR` sin desacoplar primero `ERP` y `contracts`.

### ERP Core no usado

Dentro de `ERP` hay endpoints sin uso detectado en la app, pero no conviene tratarlos como un modulo aparte hasta separarlos.

Grupos que hoy salen como candidatos de revision:

- `activities`
- `deliverables`
- `subactivities`
- `task-templates`
- `time-sessions`
- `time-tracking`
- `reports/time`
- documentos de proyecto
- parte de `milestones`
- `simulations`

Lectura: aqui la unidad de trabajo no debe ser el router entero, sino subdominios internos de ERP.

## Candidatos mas claros para extraer del proyecto

Ordenados de mas claros a mas delicados:

1. `tickets` solo despues de desacoplar dashboard
2. `invitations`
3. `audit`
4. `internal` si confirmamos que no hay invocadores externos

## No conviene extraer todavia

- `hr`
- `erp` como bloque general
- `company-portfolio`
- `external-collaborations`
- `tenants` completo
- `users` completo

Motivo: aunque algunas rutas concretas no se usen en la UI actual, siguen soportando flujos compartidos o dependencias de negocio.

## Secuencia segura recomendada

1. Congelar el inventario real de rutas y dependencias.
2. Separar en tests los dominios candidatos a extraer: `contracts`, `invoices`, `tickets`, `invitations`.
3. Introducir composicion de routers por dominio para poder apagar bloques completos sin tocar el resto.
4. Rediseñar dashboard para que no dependa de tickets antes de sacar `tickets`.
5. Desacoplar `ERP` de `HR` antes de plantear una poda de `hr`.
6. Hacer una segunda pasada fina dentro de `ERP` para podar subdominios no usados.

## Decision operativa

Si el objetivo es dejar este repo solo para `construction-log`, la estrategia mas segura no es "borrar endpoints" sino:

- extraer dominios ajenos como paquetes o servicios separados,
- desmontar sus routers del `api_v1_router`,
- y despues eliminar modelos, workers, tests y docs asociados en tandas controladas.

Ese enfoque reduce mucho el riesgo de romper funcionalidades compartidas que hoy no se ven desde tu frontend pero siguen vivas dentro del backend.
