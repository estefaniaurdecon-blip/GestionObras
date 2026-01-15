# Arquitectura General de la Plataforma

## Componentes principales

- **Backend SaaS (FastAPI)**  
  Núcleo de negocio multi‑tenant:
  - Autenticación y MFA.
  - Multi‑tenant por subdominio.
  - RBAC avanzado.
  - Auditoría centralizada.
  - Catálogo y lanzador de herramientas (SSO básico).

- **Módulo ERP (FastAPI)**  
  Gestión operativa interna por tenant:
  - Proyectos, tareas y control de tiempo.
  - APIs REST bajo `/api/v1/erp`.

- **Frontend (React + TypeScript)**  
  Interfaz desacoplada:
  - Login + paso de MFA.
  - Dashboard por tenant.
  - Listado y lanzamiento de herramientas (iframe o redirect).

- **Infraestructura (Docker + Cloudflare)**  
  - Servicios contenedorizados y aislados.
  - Entrada única vía Cloudflare Tunnel y HTTPS.
  - Subdominios por servicio y por tenant.

## Diagrama lógico (alto nivel)

```text
                +-----------------------+
                |      Usuarios B2B     |
                +-----------+-----------+
                            |
                            v
                  HTTPS (Cloudflare)
                            |
                +-----------+-----------+
                |   Cloudflare Tunnel   |
                +-----------+-----------+
                            |
          +-----------------+-------------------------+
          |                 |                         |
          v                 v                         v
  api.mavico.shop   dashboard.mavico.shop      erp.mavico.shop
 (FastAPI)          (Frontend React)          (Frontend React)

          \________________  _______________________/
                           \/
                     Red interna Docker
                           /\
                          /  \
                         v    v
                    PostgreSQL   (Herramientas externas:
                                  Moodle, BI, n8n, etc.)
```

## Multi‑Tenant por subdominio

- Cada tenant se representa mediante `Tenant` en el backend FastAPI.
- El campo `Tenant.subdomain` almacena el identificador de subdominio (ej. `acme`).
- Resolución de tenant:
  - En desarrollo se puede usar `X-Tenant-Id`.
  - En producción se resuelve mediante el header `Host`:
    - `acme.mavico.shop` → `subdomain="acme"` → tenant asociado.
    - Cualquier petición sin subdominio válido se rechaza.

## Flujo de autenticación

1. **Login paso 1 (FastAPI)**  
   - El usuario envía email + password.  
   - Si es Super Admin (o no tiene MFA habilitado) → se emite JWT de acceso.  
   - Si tiene MFA habilitado → respuesta con `mfa_required=true`.

2. **Login paso 2 (MFA TOTP)**  
   - El usuario envía código TOTP (MFA).  
   - Si la verificación es correcta → se emite JWT de acceso.

3. **Uso del JWT**  
   - El frontend almacena el token de acceso (localStorage en esta versión; en entornos más estrictos se recomienda cookie `httpOnly`).
   - El token se incluye en `Authorization: Bearer <token>` hacia FastAPI.

## RBAC y permisos

- Modelo:
  - `Role` – rol lógico (super_admin, tenant_admin, manager, user).
  - `Permission` – permisos granulares (`tenants:read`, `users:create`, etc.).
  - `RolePermission` – tabla N:N que vincula roles y permisos.
  - `User.role_id` – vínculo usuario‑rol.
  - `User.is_super_admin` – bypass global (para administración del sistema).

- Middleware de permisos:
  - Dependencia `require_permissions(["perm:code"])` en FastAPI comprueba:
    - Si el usuario es Super Admin → acceso concedido.
    - Si no, consulta permisos asociados al rol.

## Integración de herramientas (Moodle, ERP, etc.)

- Catálogo global con el modelo `Tool`.
- Asignación por tenant con `TenantTool`.
- El backend expone:
  - Listado de herramientas por tenant.
  - Endpoint de lanzamiento SSO básico que devuelve una `launch_url` firmada con JWT (corta duración).
- El frontend consume estas APIs y:
  - Lanza herramientas en iframe cuando el embebido lo permite.
  - O redirige al usuario si es más adecuado.
