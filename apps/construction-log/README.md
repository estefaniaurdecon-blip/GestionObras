Workdir recomendado: `apps/construction-log` (wrapper).

El Vite real corre en `apps/construction-log/construction-log-supabase-local` y usa su `index.html`.

Ejecuta: `npm run install:app` y luego `npm run dev` (URL local: `http://localhost:8080`).

La app usa proxy de Vite: frontend llama a `/api/*` (same-origin) y Vite reenvia a `http://192.168.1.227:8000`.
Variables activas en `.env.local`: `VITE_API_BASE_URL=/api` y `VITE_TENANT_ID=1`.
