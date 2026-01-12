# Instalación y despliegue de la plataforma

Este documento resume, de forma práctica, cómo preparar el entorno y levantar todos los servicios con Docker.

---

## 1. Requisitos previos

- Docker y Docker Compose instalados en la máquina.
- Puertos libres:
  - `5433` (PostgreSQL interno)
  - `8000` (backend FastAPI)
  - `8080` (Moodle)
  - `5173` (frontend React)
- Acceso a Internet para descargar las imágenes base.

---

## 2. Primer arranque en local (desarrollo)

Desde la raíz del proyecto:

```bash
cd infra
docker compose up --build
```

Esto levanta:

- `saas-db` → PostgreSQL 16 (puerto host `5433`).
- `saas-backend-fastapi` → API principal FastAPI (`http://localhost:8000`).
- `saas-frontend-react` → frontend React (`http://localhost:5173`).
- `saas-moodle-db` + `saas-moodle` → Moodle (`http://localhost:8080`).
- `saas-cloudflared` → túnel Cloudflare (si está configurado).

Para parar todos los servicios:

```bash
cd infra
docker compose down
```

---

## 3. Variables de entorno clave

### FastAPI (`backend-fastapi/.env`)

- `DATABASE_URL` → conexión a PostgreSQL (ya apuntando a `db` en Docker).
- `SECRET_KEY` → clave JWT.
- `PRIMARY_DOMAIN` → dominio base para subdominios de tenants.
- SMTP (para correos de invitación y MFA):
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USERNAME`
  - `SMTP_PASSWORD`
  - `SMTP_FROM`
  - `SMTP_USE_TLS`

### Infraestructura (`infra/.env`)

- `TUNNEL_TOKEN` → token de Cloudflare Tunnel (solo si se usa acceso externo).

---

## 4. URLs de servicios en local

- **Frontend plataforma**: `http://localhost:5173`
- **API FastAPI**: `http://localhost:8000/api/v1`
- **Moodle**: `http://localhost:8080`

Credenciales iniciales relevantes:

- Super Admin (plataforma):
  - Email: `dios@cortecelestial.god`
  - Contraseña: `temporal`

El Super Admin se crea automáticamente por el seed de RBAC en FastAPI.

---

## 5. Flujo típico tras el arranque

1. Acceder al frontend:
   - `http://localhost:5173`
   - Login como Super Admin (`dios@cortecelestial.god` / `temporal`).

2. Crear tenants y sus administradores:
   - Menú `Ajustes de tenants`.
   - Cada alta de tenant crea su `tenant_admin` y envía correo de bienvenida / invitación.

3. Invitar usuarios por correo:
   - Menú `Usuarios`.
   - Como Super Admin o `tenant_admin`, usar el formulario de “Invitar usuario por correo”.

4. Configurar herramientas por tenant:
   - Menú `Herramientas`.
   - Activar ERP interno y Moodle para cada tenant necesario.

5. Usar ERP y Moodle:
   - Desde el Dashboard o `Herramientas`:
     - Moodle se abre en `http://localhost:8080`.
     - El ERP se integra en el frontend como módulo interno.

---

## 6. Despliegue orientado a producción (resumen)

Para un despliegue más cercano a producción:

1. Configurar variables reales:
   - `backend-fastapi/.env` (SECRET_KEY, SMTP, dominios).
   - `infra/.env` (TUNNEL_TOKEN de Cloudflare).

2. Usar el override de producción:

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

3. En Cloudflare:
   - Apuntar el dominio a Cloudflare.
   - Configurar el túnel con los hostnames:
     - `api.midominio.com` → backend FastAPI.
     - `erp.midominio.com` → Frontend del ERP.
     - `dashboard.midominio.com` → frontend React.
     - `*.midominio.com` → tenants.

La configuración detallada de dominios y túnel está ampliada en `documentacion/infraestructura.md`.
