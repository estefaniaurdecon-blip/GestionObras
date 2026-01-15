Frontend React - Dashboard SaaS Multi-Tenant
============================================

Este proyecto implementa el frontend desacoplado de la plataforma:
- Login + MFA.
- Dashboard por tenant.
- Acceso a herramientas externas (catálogo / por tenant).

Stack:
- React + TypeScript.
- Vite (build rápido).
- TanStack Router (navegación).
- TanStack Query (data fetching).
- Chakra UI (UI components).

Estructura básica:
- `src/main.tsx`        -> Punto de entrada de React.
- `src/router.tsx`      -> Definición de rutas (login, dashboard, etc.).
- `src/api/client.ts`   -> Configuración de cliente HTTP (axios/fetch).
- `src/api/auth.ts`     -> Funciones para login/MFA.
- `src/api/tools.ts`    -> Funciones para herramientas.
- `src/components/*`    -> Componentes reutilizables.
- `src/pages/*`         -> Páginas principales (Login, MFAVerify, Dashboard).

