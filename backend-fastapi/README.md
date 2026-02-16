Backend FastAPI - Core API multi-tenant
=======================================

Este servicio implementa la API principal de la plataforma SaaS multi-tenant.

Objetivos clave:
- Multi-tenant (tenant por subdominio o `tenant_id`).
- Autenticación JWT con MFA.
- RBAC (Super Admin, Tenant Admin, User).
- Gestión de tenants, usuarios y herramientas.

Estructura básica (carpeta `app`):
- `main.py`          -> Punto de entrada FastAPI.
- `core/config.py`   -> Configuración basada en variables de entorno.
- `core/security.py` -> Lógica de seguridad (hash contraseñas, JWT, MFA).
- `db/session.py`    -> Conexión a base de datos y sesión.
- `db/base.py`       -> Registro central de modelos SQLModel.
- `models/*`         -> Modelos de base de datos (tenants, users, roles, tools...).
- `api/deps.py`      -> Dependencias comunes (usuario actual, tenant actual...).
- `api/v1/*`         -> Rutas versionadas (auth, tenants, users, tools, health).

Para desarrollo local:
1. Crear un entorno virtual.
2. Instalar dependencias con `pip install -r requirements.txt`.
3. Crear un fichero `.env` basado en `.env.example`.
4. Ejecutar `uvicorn app.main:app --reload`.

---

ERP - Endpoints de Partes, Control de Accesos y Maquinaria Alquilada
====================================================================

Se añadieron endpoints `ERP` bajo `/api/v1/erp` para cubrir partes de trabajo (`work-reports`) y maquinaria de alquiler (`rental-machinery`) con aislamiento estricto por tenant.

Matriz de compatibilidad (API original vs actual)
-------------------------------------------------

Comparativa realizada contra `referencias/saas_original_companero/backend-fastapi`:

- Endpoints originales mantenidos: **105**
- Endpoints nuevos añadidos: **15**
- Endpoints eliminados: **0**

Regla aplicada de compatibilidad:
- No se cambia ni elimina ninguna ruta original.
- Solo se añaden rutas nuevas (todas bajo `/api/v1/erp`).

Tabla de endpoints añadidos:

| Estado | Metodo | Ruta | Modulo | Nota |
|---|---|---|---|---|
| Nuevo | `GET` | `/api/v1/erp/work-reports` | `erp` | Listado de partes |
| Nuevo | `GET` | `/api/v1/erp/work-reports/{report_id}` | `erp` | Detalle de parte |
| Nuevo | `POST` | `/api/v1/erp/work-reports` | `erp` | Crear parte |
| Nuevo | `PATCH` | `/api/v1/erp/work-reports/{report_id}` | `erp` | Editar parte |
| Nuevo | `DELETE` | `/api/v1/erp/work-reports/{report_id}` | `erp` | Soft delete de parte |
| Nuevo | `POST` | `/api/v1/erp/work-reports/sync` | `erp` | Sync batch offline |
| Nuevo | `GET` | `/api/v1/erp/access-control-reports` | `erp` | Listado de controles de acceso |
| Nuevo | `GET` | `/api/v1/erp/access-control-reports/{report_id}` | `erp` | Detalle de control de acceso |
| Nuevo | `POST` | `/api/v1/erp/access-control-reports` | `erp` | Crear control de acceso |
| Nuevo | `PATCH` | `/api/v1/erp/access-control-reports/{report_id}` | `erp` | Editar control de acceso |
| Nuevo | `DELETE` | `/api/v1/erp/access-control-reports/{report_id}` | `erp` | Soft delete de control de acceso |
| Nuevo | `GET` | `/api/v1/erp/rental-machinery` | `erp` | Listado de maquinaria alquilada |
| Nuevo | `POST` | `/api/v1/erp/rental-machinery` | `erp` | Crear maquinaria alquilada |
| Nuevo | `PATCH` | `/api/v1/erp/rental-machinery/{machinery_id}` | `erp` | Editar maquinaria alquilada |
| Nuevo | `DELETE` | `/api/v1/erp/rental-machinery/{machinery_id}` | `erp` | Soft delete de maquinaria alquilada |

Matriz operativa de integracion (request/response minimo)
---------------------------------------------------------

Base comun para los 15 endpoints nuevos:
- Header obligatorio: `Authorization: Bearer <token>`
- Header de scope tenant (solo superadmin): `X-Tenant-Id: <id>`
- Formato: `application/json` (excepto respuestas `204 No Content`)

Work Reports
~~~~~~~~~~~~

| Endpoint | Permiso | Request minimo | Response OK | Errores comunes |
|---|---|---|---|---|
| `GET /api/v1/erp/work-reports` | `erp:read` | Query opcional: `project_id`, `date_from`, `date_to`, `status`, `updated_since`, `include_deleted`, `limit`, `offset` | `200` -> `WorkReportRead[]` | `400` |
| `GET /api/v1/erp/work-reports/{report_id}` | `erp:read` | Path: `report_id` | `200` -> `WorkReportRead` | `404`, `400` |
| `POST /api/v1/erp/work-reports` | `erp:manage` o `erp:track` | Body `WorkReportCreate` (minimo: `project_id`, `date`) + header opcional `Idempotency-Key` | `201` -> `WorkReportRead` | `400`, `409` |
| `PATCH /api/v1/erp/work-reports/{report_id}` | `erp:manage` o `erp:track` | Body `WorkReportUpdate` (al menos 1 campo; opcional `expected_updated_at`) | `200` -> `WorkReportRead` | `404`, `409`, `400` |
| `DELETE /api/v1/erp/work-reports/{report_id}` | `erp:manage` | Path: `report_id` | `204` vacio (soft delete) | `404`, `409`, `400` |
| `POST /api/v1/erp/work-reports/sync` | `erp:manage` o `erp:track` | Body `WorkReportSyncRequest` (`operations[]`, opcional `since`) | `200` -> `WorkReportSyncResponse` | `400`, `404`, `409` |

Access Control Reports
~~~~~~~~~~~~~~~~~~~~~~

| Endpoint | Permiso | Request minimo | Response OK | Errores comunes |
|---|---|---|---|---|
| `GET /api/v1/erp/access-control-reports` | `erp:read` | Query opcional: `project_id`, `date_from`, `date_to`, `updated_since`, `include_deleted`, `limit`, `offset` | `200` -> `AccessControlReportRead[]` | `400` |
| `GET /api/v1/erp/access-control-reports/{report_id}` | `erp:read` | Path: `report_id` | `200` -> `AccessControlReportRead` | `404`, `400` |
| `POST /api/v1/erp/access-control-reports` | `erp:manage` o `erp:track` | Body `AccessControlReportCreate` (minimo: `date`, `site_name`, `responsible`) | `201` -> `AccessControlReportRead` | `400` |
| `PATCH /api/v1/erp/access-control-reports/{report_id}` | `erp:manage` o `erp:track` | Body `AccessControlReportUpdate` (al menos 1 campo; opcional `expected_updated_at`) | `200` -> `AccessControlReportRead` | `404`, `409`, `400` |
| `DELETE /api/v1/erp/access-control-reports/{report_id}` | `erp:manage` | Path: `report_id` | `204` vacio (soft delete) | `404`, `400` |

Rental Machinery
~~~~~~~~~~~~~~~~

| Endpoint | Permiso | Request minimo | Response OK | Errores comunes |
|---|---|---|---|---|
| `GET /api/v1/erp/rental-machinery` | `erp:read` | Query opcional: `project_id`, `active_on` (o alias `date`), `status`, `include_deleted`, `limit`, `offset` | `200` -> `RentalMachineryRead[]` | `400` |
| `POST /api/v1/erp/rental-machinery` | `erp:manage` | Body `RentalMachineryCreate` (minimo: `project_id`, `name`, `start_date`) | `201` -> `RentalMachineryRead` | `400` |
| `PATCH /api/v1/erp/rental-machinery/{machinery_id}` | `erp:manage` | Body `RentalMachineryUpdate` (al menos 1 campo) | `200` -> `RentalMachineryRead` | `404`, `400` |
| `DELETE /api/v1/erp/rental-machinery/{machinery_id}` | `erp:manage` | Path: `machinery_id` | `204` vacio (soft delete) | `404`, `400` |

Cambios de backend aplicados
----------------------------

- Registro de modelos SQLModel en `app/db/base.py`:
  - `WorkReport`
  - `WorkReportSyncLog`
  - `AccessControlReport`
  - `RentalMachinery`
- Nuevos schemas en `app/schemas/erp.py`:
  - `WorkReportCreate/Update/Read`
  - `WorkReportSyncRequest/Response`
  - `AccessControlReportCreate/Update/Read`
  - `RentalMachineryCreate/Update/Read`
- Nueva lógica de negocio en `app/services/erp_service.py`:
  - CRUD de partes con bloqueo por estado cerrado.
  - Soft delete de partes (`deleted_at`).
  - Sync batch con ack por operación e idempotencia por `client_op_id`.
  - CRUD de controles de acceso con aislamiento por tenant.
  - CRUD de maquinaria alquilada + filtro por fecha activa.
- Nuevas rutas en `app/api/v1/erp.py`.

Autenticación, permisos y tenant
--------------------------------

- Todos los endpoints requieren `Authorization: Bearer <token>`.
- Se usa `X-Tenant-Id` como scope explícito cuando el usuario es superadmin.
- El tenant es obligatorio para estos recursos: no se opera fuera de tenant.
- Las consultas aplican tenant en DB (`WHERE tenant_id = ...`) y en lookup por ID se valida pertenencia antes de mutar.
- Permisos:
  - Lectura: `erp:read`
  - Crear/editar/sync partes: `erp:manage` o `erp:track`
  - Eliminar partes: `erp:manage`
  - CRUD controles de acceso: `erp:manage` o `erp:track` (delete: `erp:manage`)
  - CRUD maquinaria alquilada: `erp:manage`

Estado de negocio en partes
---------------------------

- Si un parte está `closed` (`status=closed` o `is_closed=true`), pasa a solo lectura.
- No se permite editar ni eliminar partes cerrados.
- `DELETE` realiza soft delete (`deleted_at`), no hard delete.

Endpoints - Work Reports
------------------------

1) `GET /api/v1/erp/work-reports`
- Filtros:
  - `project_id`
  - `date_from` / `date_to` (`YYYY-MM-DD`)
  - `status`
  - `updated_since` (ISO datetime)
  - `include_deleted` (bool)
  - `limit` / `offset`
- Orden: `date DESC, updated_at DESC`.

2) `GET /api/v1/erp/work-reports/{report_id}`
- Obtiene un parte por ID dentro del tenant.

3) `POST /api/v1/erp/work-reports`
- Crea parte (requiere `project_id` y `date`).
- Soporta cabecera opcional `Idempotency-Key`.

Ejemplo request:
```json
{
  "project_id": 12,
  "date": "2026-02-12",
  "title": "Parte diario",
  "status": "draft",
  "payload": {"sections": {}}
}
```

4) `PATCH /api/v1/erp/work-reports/{report_id}`
- Edita parte solo si no está cerrado.
- Concurrencia opcional con `expected_updated_at`.

5) `DELETE /api/v1/erp/work-reports/{report_id}`
- Soft delete.
- Bloqueado si el parte está cerrado.

6) `POST /api/v1/erp/work-reports/sync`
- Sync batch offline (enfoque A).
- Entrada: operaciones `create/update/delete` con `client_op_id`.
- Salida:
  - `ack[]` por operación (`ok/error`).
  - `id_map` (`client_temp_id -> server_id`) para resolver IDs locales.
  - `server_changes` opcional si se envía `since`.
  - Cuando se usa `since`, `server_changes` incluye también registros soft-deleted (`deleted_at`) para propagar borrados offline.

Ejemplo request sync:
```json
{
  "since": "2026-02-12T00:00:00Z",
  "operations": [
    {
      "client_op_id": "op-001",
      "op": "create",
      "client_temp_id": "tmp-123",
      "data": {
        "project_id": 12,
        "date": "2026-02-12",
        "title": "Parte offline",
        "status": "draft",
        "payload": {"source": "offline"}
      }
    }
  ]
}
```

Ejemplo response sync:
```json
{
  "ack": [
    {
      "client_op_id": "op-001",
      "op": "create",
      "ok": true,
      "report_id": 77,
      "client_temp_id": "tmp-123",
      "mapped_server_id": 77
    }
  ],
  "id_map": {"tmp-123": 77},
  "server_changes": []
}
```

Idempotencia y conflictos en Sync
---------------------------------

- Idempotencia por operación: `client_op_id` se registra en `erp_work_report_sync_log`.
- La idempotencia está namespaced por tenant (índice único `tenant_id + client_op_id`).
- Si llega dos veces el mismo `client_op_id`, se devuelve el mismo ack guardado.
- Para `create`, además se usa `client_op_id` como `Idempotency-Key` interno.
- En `POST /work-reports`, `Idempotency-Key` también se persiste por tenant (`tenant_id + idempotency_key`).
- Conflictos de edición:
  - Si se envía `expected_updated_at` y no coincide, se responde conflicto.
  - Partes cerrados devuelven conflicto (solo lectura).

Endpoints - Rental Machinery
----------------------------

1) `GET /api/v1/erp/rental-machinery`
- Filtros:
  - `project_id`
  - `active_on=YYYY-MM-DD` (o `date=YYYY-MM-DD` alias)
  - `status`
  - `include_deleted`
  - `limit` / `offset`
- Regla de activo por fecha:
  - `start_date <= active_on`
  - `end_date IS NULL OR end_date >= active_on`
  - por defecto `status=active` cuando se usa `active_on` y no se pasa `status`.

2) `POST /api/v1/erp/rental-machinery`
3) `PATCH /api/v1/erp/rental-machinery/{machinery_id}`
4) `DELETE /api/v1/erp/rental-machinery/{machinery_id}` (soft delete)

Ejemplo create:
```json
{
  "project_id": 12,
  "name": "Grua telescopica",
  "provider": "Proveedor X",
  "start_date": "2026-02-01",
  "end_date": null,
  "price": "120.00",
  "price_unit": "day",
  "status": "active"
}
```

Endpoints - Access Control Reports
----------------------------------

1) `GET /api/v1/erp/access-control-reports`
- Filtros:
  - `project_id`
  - `date_from` / `date_to` (`YYYY-MM-DD`)
  - `updated_since` (ISO datetime)
  - `include_deleted` (bool)
  - `limit` / `offset`

2) `GET /api/v1/erp/access-control-reports/{report_id}`
- Obtiene un control de accesos por ID dentro del tenant.

3) `POST /api/v1/erp/access-control-reports`
- Crea un control de accesos.

4) `PATCH /api/v1/erp/access-control-reports/{report_id}`
- Edita un control de accesos existente.

5) `DELETE /api/v1/erp/access-control-reports/{report_id}`
- Soft delete por tenant.

Compatibilidad frontend y decisiones
------------------------------------

- Se mantuvieron rutas bajo `/api/v1/erp/*` para encajar con el cliente actual.
- Se eligió sync **A** (`POST /work-reports/sync`) para adaptarse al outbox offline.
- No se añadió endpoint alternativo `changes`; el pull incremental se resuelve con:
  - `updated_since` en `GET /work-reports`
  - `since` en `POST /work-reports/sync`.
- `project_id` se usa de forma explícita (se evitó `work_id`).

Migraciones de esquema
----------------------

- Este repo **no usa Alembic** actualmente.
- El esquema se inicializa con `SQLModel.metadata.create_all()` y migraciones incrementales controladas en `app/db/session.py`.
- Por eso no se cambió a Alembic en esta entrega: no hay pipeline ni estructura Alembic activa en el proyecto.

Versión de Python para tests / CI
---------------------------------

- Recomendado para tests/CI: **Python 3.11 o 3.12**.
- Con Python 3.14 hay incompatibilidades conocidas en este entorno de pruebas (stack SQLModel/Pydantic actual).

Checklist de pruebas añadidas
-----------------------------

Archivo: `tests/test_erp_work_reports_and_rental.py`

- Aislamiento por tenant en partes.
- Bloqueo de edición/eliminación cuando el parte está cerrado.
- Idempotencia en sync por `client_op_id`.
- Idempotencia namespaced por tenant (`Idempotency-Key` y `client_op_id`).
- Pull de sync con `since` devolviendo también soft deletes.
- Filtro de maquinaria alquilada activa por fecha.
