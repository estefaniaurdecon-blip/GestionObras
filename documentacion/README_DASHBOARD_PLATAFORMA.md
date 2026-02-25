# URDECON INNOVA · Resumen funcional de la plataforma SaaS

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.


Este documento resume, a alto nivel, lo que incluye actualmente la plataforma (backend, frontend, ERP y soporte), pensado para presentarlo internamente o a clientes.

---

## 1. Arquitectura general

- **backend-fastapi**
  - Autenticación (JWT).
  - MFA por correo electrónico.
  - Usuarios, roles y permisos (RBAC).
  - Tenants (empresas) y herramientas asociadas.
  - Módulo de soporte/tickets multi‑tenant.
  - Auditoría (registro de acciones).
  - Endpoint de resumen para el dashboard.

- **Módulo ERP (FastAPI)**
  - Proyectos y tareas internas.
  - Tracking de tiempo en tiempo real (play/stop).
  - Partes de horas consolidados (`TimeEntry`) para informes.

- **Moodle**
  - LMS externo, integrado como herramienta corporativa.

- **frontend-react**
  - Login, verificación MFA y cierre de sesión.
  - Dashboard con métricas (tenants, usuarios, herramientas, soporte) y acciones rápidas.
  - Gestión de tenants, usuarios y herramientas.
  - Control de tiempo del ERP e informe de horas.
  - Pantalla de soporte/tickets, auditoría y ajustes de usuario.

---

## 2. Roles, autenticación y MFA

- **Super Admin global**
  - Usuario especial: `dios@cortecelestial.god`.
  - Ve y gestiona **todos** los tenants, usuarios, herramientas y tickets.
  - No está obligado a usar MFA (por requisitos del proyecto).

- **Admin de tenant (`tenant_admin`)**
  - Gestiona únicamente los usuarios, herramientas y tickets de su **tenant**.
  - No puede ver ni tocar otros tenants.

- **Usuario normal**
  - Solo ve y usa herramientas de su tenant.
  - No tiene acceso a configuración global ni a otros tenants.

- **MFA por correo electrónico**
  - En el login se envía un código al email del usuario (3 intentos).
  - Hasta validar el código, el usuario permanece **inactivo**.
  - Tras la primera verificación: `is_active = True` y acceso normal con JWT.

---

## 3. Tenants y usuarios

### Tenants

- Pantalla de **Ajustes de tenants** (solo Super Admin):
  - Crear tenant con: nombre, subdominio y estado activo.
  - Al crear un tenant se crea también su **admin principal** (email + contraseña).
  - Listado de tenants existentes, con opción de eliminar.

- Al eliminar un tenant:
  - Se limpian relaciones con herramientas y referencias de auditoría.
  - Los usuarios del tenant quedan sin tenant, sin rol y desactivados.

### Usuarios

- Pantalla de **Usuarios**:
  - Super Admin puede seleccionar cualquier tenant.
  - `tenant_admin` ve únicamente los usuarios de su tenant (sin selector global).
  - Crear usuario con nombre, email, contraseña y rol (`tenant_admin` o `user`).
  - Ver estado **Activo/Inactivo** y cambiarlo con un switch sin recargar la página.
  - Eliminar usuario (con restricciones para no borrar al Super Admin global).

- **Ajustes de usuario**:
  - Editar nombre completo.
  - Cambiar contraseña con validación básica.
  - Configurar preferencia de modo claro/oscuro (guardado en el navegador).

---

## 4. Herramientas y Moodle

- Catálogo de herramientas a nivel global (ejemplo actual):
  - **Moodle** (LMS).
  - **ERP interno** (FastAPI).

- Configuración por tenant:
  - El Super Admin activa o desactiva herramientas para cada tenant.
  - Los `tenant_admin` solo ven y gestionan las herramientas de su tenant.

- Uso desde la plataforma:
  - En el Dashboard y en la página de herramientas:
    - **Moodle** se abre en una pestaña nueva (por seguridad y restricciones de embebido).
    - **ERP interno** navega a rutas internas del dashboard (sin iframes).

---

## 5. ERP: proyectos, tareas y tiempo

- **Modelos principales en FastAPI (SQLModel)**:
  - `Project`: proyectos internos.
  - `Task`: tareas (el proyecto puede ser opcional).
  - `TimeSession`: sesiones de tracking en tiempo real (inicio/fin).
  - `TimeEntry`: partes de horas consolidados (base para informes).

- **Flujo de tracking**:
  - `start_time_session(user, task)`:
    - Cierra cualquier sesión activa que tuviera el usuario.
    - Crea una nueva sesión activa para la tarea indicada.
  - `stop_time_session(user)`:
    - Finaliza la sesión activa, calcula la duración (segundos).
    - Guarda la duración y marca la sesión como inactiva.
    - Crea automáticamente un `TimeEntry` con las horas (segundos / 3600).

- **Informe de horas (backend ERP)**:
  - Ruta de informe de horas (ver `documentacion/ENDPOINTS_UNIFICADOS.md`):
    - Filtros: proyecto, usuario, rango de fechas.
    - Devuelve horas agregadas por **proyecto, tarea y usuario**.

---

## 6. Control de tiempo e Informe de horas (frontend)

### Control de tiempo

- Pantalla **Control de tiempo (ERP)**:
  - Selector de tarea del ERP.
  - Botones **Iniciar** y **Detener**.
  - Cronómetro en vivo mientras la sesión está activa.
  - Mientras hay sesión:
    - Inhabilita el campo de tarea y el botón de iniciar.
    - Muestra la duración en formato hh:mm:ss.

### Informe de horas

- Pantalla **Informe de horas (ERP)**:
  - Filtros:
    - Proyecto (cargado desde el ERP).
    - Fechas Desde / Hasta.
    - Filtro por usuario (texto “contiene”).
  - Resultados:
    - Tabla con columnas: Proyecto, Tarea, Usuario, Horas.
    - Total de horas del periodo.
    - Botón para **Exportar CSV** con los datos filtrados.

- Layout y responsive:
  - Filtros en `SimpleGrid` responsivo (1, 2 o 4 columnas según ancho).
  - Botones alineados a la derecha en una fila independiente.
  - Tabla con scroll horizontal en pantallas pequeñas.

---

## 7. Auditoría

- Modelo `AuditLog` en FastAPI:
  - Guarda: usuario, tenant, acción, detalles y fecha.

- Ejemplos de acciones registradas:
  - `tool.list` (cuando se listan herramientas).
  - `tenant.list`, `tenant.create`, `tenant.delete`.
  - Acciones de login y cambios relevantes en configuración.

- Endpoint de auditoria (ver `documentacion/ENDPOINTS_UNIFICADOS.md`):
  - Protegido con permiso `audit:read`.
  - **Super Admin**: puede ver todos los registros (con posibilidad de filtrar por tenant).
  - `tenant_admin` / usuario: solo ven registros de su propio tenant.

- Pantalla **Auditoría**:
  - Tabla con: Fecha, Usuario, Acción, Detalles.
  - Mensajes claros para carga, error y estado vacío.

---

## 8. Dashboard y métricas

- API de resumen (ver `documentacion/ENDPOINTS_UNIFICADOS.md`):
  - Calcula, entre otros:
    - `tenants_activos`:
      - Super Admin → total de tenants activos.
      - `tenant_admin` / usuario → 1 si tiene tenant, 0 si no.
    - `usuarios_activos`:
      - Super Admin → usuarios activos en todo el sistema.
      - `tenant_admin` / usuario → usuarios activos de su tenant.
    - `herramientas_activas` → herramientas activas del tenant actual.
    - `horas_hoy` y `horas_ultima_semana` → preparados para conectar con ERP.
    - Métricas de soporte por tenant/usuario:
      - `tickets_abiertos`.
      - `tickets_en_progreso`.
      - `tickets_resueltos_hoy`.
      - `tickets_cerrados_ultima_semana`.

- Pantalla **Dashboard** (frontend):
  - Tarjetas de métricas (stats) con las cifras anteriores.
  - Bloque **Acciones rápidas**:
    - Super Admin:
      - Crear / gestionar tenants.
    - Todos:
      - Gestionar usuarios.
      - Ver informe de horas.
      - Ver tickets de soporte.
      - Ver herramientas.
  - Sección de **Herramientas disponibles** con el grid de Moodle y ERP, con navegación interna para el ERP.

---

## 9. Soporte / Tickets

### Modelo y backend

- `Ticket` (FastAPI + SQLModel):
  - Multi-tenant: `tenant_id`, `created_by_id`, `assigned_to_id`.
  - Estado: `open`, `in_progress`, `resolved`, `closed`.
  - Prioridad: `low`, `medium`, `high`, `critical`.
  - Categoría funcional (`category`): ERP, Moodle, Plataforma, Infraestructura, etc.
  - Campos de actividad y SLA:
    - `last_activity_at` (última actividad).
    - `first_response_at` (primera respuesta de un agente).
    - `resolved_at` (cuando se marca resuelto).
    - `closed_at` (cuando se cierra definitivamente).

- `TicketMessage`:
  - Conversación por ticket.
  - Campo `is_internal` para notas internas solo visibles a Super Admin y usuarios con permiso `tickets:manage`.

- `TicketParticipant`:
  - Participantes del ticket (creador, asignado, watchers) para visibilidad avanzada.

- Endpoints REST de tickets (ver `documentacion/ENDPOINTS_UNIFICADOS.md`):
  - Listar tickets con filtros (estado, prioridad, categoría, herramienta, `tenant_id` para Super Admin, “solo mis tickets”).
  - Crear ticket.
  - Cambiar estado.
  - Asignar responsable.
  - Listar y añadir mensajes.

- RBAC de soporte:
  - Permisos:
    - `tickets:create`
    - `tickets:read_own`
    - `tickets:read_tenant`
    - `tickets:manage`
  - Super Admin:
    - Ve y gestiona todos los tickets del sistema.
  - `tenant_admin`:
    - Ve todos los tickets de su tenant, puede gestionarlos y añadir notas internas.
  - Usuario normal:
    - Ve y gestiona solo sus propios tickets (o aquellos en los que participa).

### Pantalla de Soporte (frontend)

- Listado de tickets:
  - Filtros por:
    - Estado.
    - Prioridad.
    - Categoría.
    - “Solo mis tickets”.
  - Super Admin:
    - Selector adicional de tenant.
    - Columna “Tenant” con el nombre del tenant al que pertenece cada ticket.
  - Tabla con columnas:
    - Tenant (solo para Super Admin).
    - Asunto.
    - Estado.
    - Prioridad.
    - Última actividad.

- Creación de tickets:
  - Usuarios de un tenant pueden crear tickets indicando:
    - Asunto.
    - Descripción.
    - Prioridad.
    - Herramienta relacionada (`tool_slug`) y categoría funcional.
  - Super Admin no crea tickets (se centra en supervisar y gestionar).

- Detalle y conversación:
  - Muestra:
    - Asunto, estado, prioridad y categoría.
    - Usuario creador y asignado.
    - Fechas de creación, última actividad y SLA (primera respuesta, resuelto, cerrado).
  - Conversación:
    - Lista de mensajes con autor, fecha y contenido.
    - Etiqueta “Nota interna” en mensajes internos.
  - Acciones rápidas:
    - Reabrir y cerrar ticket (según estado).
    - Asignar a un usuario del tenant mediante un selector.

---

## 10. UX, modo oscuro y layout

- Tema corporativo:
  - Color principal: `#00662b` (verde URDECON).
  - Logo integrado en el sidebar y pantalla de login.

- Modo claro/oscuro:
  - Todas las tarjetas usan `useColorModeValue` para fondo y cabecera, evitando bloques blancos en modo oscuro.

- Layout general:
  - `AppShell` con:
    - Sidebar fijo a la izquierda.
    - Header superior con nombre de la plataforma y usuario.
    - Contenido centrado con anchura máxima (`maxW="7xl"`), adaptable a escritorio y móvil.
