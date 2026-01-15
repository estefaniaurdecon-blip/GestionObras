Infraestructura - Docker Compose + Cloudflare
=============================================

Este directorio contiene la infraestructura para levantar todo el stack:
- backend-fastapi (API core + ERP).
- frontend-react (dashboard).
- db (PostgreSQL).
- cloudflared (Cloudflare Tunnel, esqueleto).

Fichero principal:
- `docker-compose.yml` -> Orquestación de servicios.

Notas:
- Cloudflare Tunnel requiere configurar credenciales y túneles en tu cuenta
  de Cloudflare; aquí solo se deja un esqueleto para integrarlo.
