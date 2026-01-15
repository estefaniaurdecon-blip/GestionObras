# Frontend – React

## Rol en la arquitectura

El frontend implementa la interfaz de usuario de la plataforma:

- Login + verificación MFA.
- Dashboard por tenant.
- Listado de herramientas activas.
- Lanzamiento de herramientas (iframe o redirect).

Está diseñado para estar desacoplado del backend y consumir exclusivamente APIs HTTP.

## Tecnologías

- React 18
- TypeScript
- Vite
- Chakra UI
- React Query (TanStack Query)
- TanStack Router

## Estructura

- `src/main.tsx`
  - Punto de entrada.
  - Configura Chakra UI, React Query y TanStack Router.

- `src/router.tsx`
  - Define rutas:
    - `/` → `LoginPage`.
    - `/mfa` → `MFAVerifyPage`.
    - `/dashboard` → `DashboardPage`.

- `src/api/client.ts`
  - Cliente Axios centralizado.
  - Lee `VITE_API_BASE_URL` del entorno.
  - Adjunta automáticamente el JWT en `Authorization: Bearer`.

- `src/api/auth.ts`
  - `login(email, password)` → `/api/v1/auth/login`.
  - `verifyMFA(username, mfaCode)` → `/api/v1/auth/mfa/verify`.

- `src/api/tools.ts`
  - `fetchToolCatalog()` → catálogo global.
  - `fetchTenantTools(tenantId)` → herramientas por tenant (usa header `X-Tenant-Id` en la implementación actual).

- `src/pages/LoginPage.tsx`
  - Formulario de login:
    - Si `mfa_required=true` → navega a `/mfa`.
    - Si obtiene `access_token` → guarda token y navega a `/dashboard`.

- `src/pages/MFAVerifyPage.tsx`
  - Formulario para código TOTP.
  - Si es correcto → guarda token y navega a `/dashboard`.

- `src/pages/DashboardPage.tsx`
  - Usa React Query para cargar herramientas del tenant.
  - Muestra cards por herramienta.
  - Pensado para:
    - Invocar el endpoint de lanzamiento SSO.
    - Mostrar las herramientas en iframe o redirect.

## Configuraci��n de entorno

- En desarrollo:
  - `VITE_API_BASE_URL` debe apuntar a la API FastAPI (ej. `http://localhost:8000`).
  - `VITE_DEV_HOST` controla el host del servidor Vite (ej. `0.0.0.0`).

- En producci��n (`frontend-react/.env`):
  - `VITE_API_BASE_URL=https://api.mavico.shop`.
  - `VITE_DEV_HOST` no se usa en producci��n.

## Notas recientes

- Informe de horas: incluye columna `Coste/hora` en la tabla y el CSV.
- RRHH: el selector de usuario en empleados muestra solo correos disponibles.
