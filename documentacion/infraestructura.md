# Infraestructura y Despliegue

## Objetivos

- Entorno reproducible y aislado con Docker.
- Separación clara entre desarrollo y producción.
- Entrada única vía Cloudflare Tunnel, con HTTPS forzado.
- Subdominios por servicio y por tenant.

## Servicios Docker

Definidos en `infra/docker-compose.yml`:

- `db` (PostgreSQL 16):
  - Volumen `db_data` para persistencia.
  - Puerto `5432` expuesto solo en desarrollo.

- `backend-fastapi`:
  - Construido desde `backend-fastapi/Dockerfile`.
  - Usa `.env.example` en desarrollo.
  - Expone el puerto `8000` en desarrollo.

- `frontend-react`:
  - Construido desde `frontend-react/Dockerfile`.
  - `VITE_API_BASE_URL` apunta al backend FastAPI por nombre de servicio.
  - Expone el puerto `5173` en desarrollo.

- `cloudflared`:
  - Imagen oficial de Cloudflare Tunnel.
  - Permite abrir un túnel desde la red Docker hacia Internet.

## Override de producción

Archivo: `infra/docker-compose.prod.yml`

- Elimina la exposición de puertos (`ports: []`).
- Usa `.env` reales en backends (no los `.env.example`).
- En el frontend establece:
  - `VITE_API_BASE_URL=https://api.mavico.shop`.
- Monta `./cloudflared` en `/etc/cloudflared` dentro del contenedor:
  - `config.yml`
  - Fichero de credenciales del túnel (JSON).

Ejemplo de despliegue:

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

## Cloudflare y dominios

Dominio raíz: `mavico.shop`

Subdominios recomendados:

- `api.mavico.shop` → Backend FastAPI.
- `erp.mavico.shop` → Frontend del módulo ERP (React).
- `dashboard.mavico.shop` → Frontend React.
- `*.mavico.shop` → Tenants (ej. `acme.mavico.shop`).

Archivo `infra/cloudflared/config.yml`:

- Define el túnel `saas-mavico`.
- Especifica el fichero de credenciales.
- Configura la sección `ingress` para mapear hostnames a servicios internos.

Pasos generales en Cloudflare:

1. Añadir el dominio `mavico.shop` y apuntar los NS a Cloudflare.
2. Crear el túnel (`saas-mavico`) y descargar el JSON de credenciales.
3. Copiar el JSON a `infra/cloudflared/saas-mavico.json`.
4. Configurar hostnames en Cloudflare vinculados al túnel:
   - `api.mavico.shop`, `erp.mavico.shop`, `dashboard.mavico.shop`, `*.mavico.shop`.
5. Activar:
   - SSL/TLS “Full (strict)”.
   - “Always Use HTTPS”.
