# Backend SaaS – FastAPI

## Rol en la arquitectura

El backend FastAPI es el núcleo de negocio de la plataforma SaaS:

- Gestiona tenants, usuarios y herramientas.
- Aplica autenticación, MFA, multi‑tenant y RBAC.
- Centraliza la auditoría de acciones.
- Expone un API REST limpia y versionada (`/api/v1`).

## Tecnologías clave

- FastAPI
- SQLModel / SQLAlchemy
- PostgreSQL
- PyJWT (via `python-jose`)
- Passlib (hash de contraseñas)
- PyOTP (MFA TOTP)
- Docker

## Estructura principal

- `app/main.py`  
  - Crea la instancia de `FastAPI`.
  - Configura CORS.
  - Inicializa la base de datos en `startup`.
  - Incluye el router `/api/v1`.

- `app/core/config.py`  
  - `Settings` con Pydantic para variables de entorno:
    - `database_url`
    - `secret_key`, `algorithm`, `access_token_expire_minutes`
    - `primary_domain` (para multi‑tenant por subdominio)
  - Carga desde `.env`.

- `app/core/security.py`  
  - Hash y verificación de contraseñas (`bcrypt` vía Passlib).
  - Creación y validación de JWT:
    - `sub` → ID de usuario.
    - `tenant_id`, `is_super_admin` y otros claims.
  - MFA TOTP:
    - Generación de `mfa_secret`.
    - URI para apps tipo Google Authenticator.
    - Verificación de códigos.

- `app/db/session.py`  
  - Crea el `engine` de SQLModel.
  - Función `init_db()` que crea tablas (para desarrollo).
  - Context manager `get_session()` para gestionar sesiones de DB.

- `app/models/*`  
  - `Tenant`, `User`, `Role`, `Permission`, `RolePermission`, `Tool`, `TenantTool`, `AuditLog`.
  - Diseño orientado a separar datos globales y por tenant.

- `app/api/deps.py`  
  - `get_current_user`, `get_current_active_user`, `get_current_tenant`.
  - Resolución de tenant:
    - Por `X-Tenant-Id` (desarrollo).
    - Por subdominio real (`Host` + `primary_domain`).
  - `require_permissions(...)` para RBAC.

- `app/api/v1/*`  
  - `auth.py`: login + MFA.
  - `tenants.py`: CRUD básico de tenants (protegido por permisos).
  - `users.py`: gestión de usuarios (lectura y creación, con RBAC).
  - `tools.py`: catálogo, herramientas por tenant y lanzamiento SSO.
  - `health.py`: health check (`/health/`).

## Seed de RBAC y Super Admin

Archivo: `app/core/seed_rbac.py`

- Crea permisos base:
  - `tenants:read`, `tenants:create`
  - `users:read`, `users:create`
  - `tools:read`, `tools:launch`, `tools:configure`
  - `audit:read`

- Crea roles base:
  - `super_admin`
  - `tenant_admin`
  - `manager`
  - `user`

- Asigna permisos a roles (modelo ROLE_PERMISSIONS).
- Garantiza un usuario Super Admin global:
  - Email: `dios@cortecelestial.god`
  - Contraseña inicial: `temporal` (almacenada hasheada).
  - `is_super_admin=True`, `tenant_id=None`.
  - Rol `super_admin`.
- Asigna `tenant_admin` al primer usuario no‑superadmin de cada tenant que no tenga rol.

### Ejecución

```bash
cd backend-fastapi
python -m app.core.seed_rbac
```

Se puede ejecutar varias veces; la lógica es idempotente.

## Lanzador de herramientas (Moodle, etc.)

En `app/api/v1/tools.py`:

- `GET /api/v1/tools/catalog`
  - Lista global de herramientas (`Tool`).
  - Requiere permiso `tools:read`.

- `GET /api/v1/tools/by-tenant`
  - Lista herramientas activas del tenant actual (`TenantTool`).
  - Requiere `tools:read`.
  - Verifica que el usuario pertenece al tenant o es Super Admin.
  - Registra auditoría `tool.list`.

- `POST /api/v1/tools/{tool_id}/launch`
  - Requiere permiso `tools:launch`.
  - Verifica que la herramienta está habilitada para el tenant.
  - Comprueba pertenencia de usuario al tenant.
  - Genera JWT de 5 minutos con:
    - `user_id`, `tenant_id`, `tool_id`, `email`.
  - Devuelve `launch_url` para SSO:
    - Ejemplo: `https://moodle.mavico.shop?token=<jwt>`.
  - Registra auditoría `tool.launch`.

La lógica de consumo del token en Moodle u otra herramienta se implementa en el sistema externo (o en un gateway dedicado).

