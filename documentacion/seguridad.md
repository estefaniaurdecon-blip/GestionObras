# Seguridad y Cumplimiento

## Objetivos de seguridad

- Autenticación robusta con MFA TOTP.
- Tokens JWT de corta duración.
- Multi‑tenant rígido: un usuario no puede acceder a datos de otro tenant.
- RBAC (roles y permisos) granular.
- Auditoría completa de acciones críticas.
- Capa de exposición pública limitada (Cloudflare como único frontdoor).

## Autenticación y MFA

- Login en dos pasos:
  1. Email + contraseña.
  2. Código TOTP (MFA) para todos los usuarios, excepto Super Admin.
- Super Admin:
  - No requiere MFA según la política actual.
  - Declarado explícitamente en el modelo (`is_super_admin`).
- Las contraseñas se almacenan siempre hasheadas (`bcrypt`).

## Multi‑Tenant

- Cada tenant se identifica por `Tenant.subdomain`.
- Resolución de tenant:
  - En desarrollo: header `X-Tenant-Id` para simplificar pruebas.
  - En producción: subdominio (`Host`) comparado con `PRIMARY_DOMAIN`.
- Reglas:
  - Si el host no corresponde al dominio principal → petición rechazada.
  - Si no hay subdominio válido → petición rechazada.
  - En los endpoints de negocio, el usuario solo puede operar en su tenant salvo que sea Super Admin.

## RBAC

- Permisos base:
  - `tenants:read`, `tenants:create`
  - `users:read`, `users:create`
  - `tools:read`, `tools:launch`, `tools:configure`
  - `audit:read`

- Roles:
  - `super_admin`:
    - Acceso a todos los permisos.
    - Bypass en la comprobación de permisos.
  - `tenant_admin`:
    - Administración del tenant (usuarios, herramientas, auditoría).
  - `manager`:
    - Acceso de gestión (lectura y lanzamiento de herramientas).
  - `user`:
    - Acceso básico a herramientas asignadas.

- La verificación de permisos en FastAPI se realiza mediante una dependencia central (`require_permissions`).

## Auditoría

- Modelo `AuditLog` con:
  - `user_id`
  - `tenant_id`
  - `action`
  - `details`
  - `created_at`

- Acciones auditadas:
  - `login` (login sin MFA adicional).
  - `mfa.verify` (login con MFA).
  - `tenant.list`, `tenant.create`.
  - `user.list`, `user.create`.
  - `tool.list`, `tool.launch`.

Los registros de auditoría permiten reconstruir el historial de acciones relevantes ante incidentes o revisiones de seguridad.

## Exposición de servicios

- En producción, ningún servicio expone puertos directamente a Internet:
  - Toda la entrada pasa por Cloudflare Tunnel.
  - HTTPS forzado desde Cloudflare.
- Recomendaciones adicionales:
  - Configurar reglas de WAF en Cloudflare, según el perfil de riesgo.
  - Limitar origen de acceso a paneles de administración si procede.

