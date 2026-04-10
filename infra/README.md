Infraestructura - Docker Compose + Cloudflare
=============================================

Este directorio contiene la infraestructura para levantar todo el stack:
- backend-fastapi (API core + ERP).
- frontend-react (dashboard).
- db (PostgreSQL).
- redis.
- ollama (opcional, por profile).
- cloudflared (Cloudflare Tunnel, esqueleto).

Fichero principal:
- `docker-compose.yml` -> Orquestación de servicios.

Notas:
- Cloudflare Tunnel requiere configurar credenciales y túneles en tu cuenta
  de Cloudflare; aquí solo se deja un esqueleto para integrarlo.
- IA con Ollama:
  - Por defecto los contenedores intentan llegar a `OLLAMA_BASE_URL`.
  - En desarrollo con Ollama instalado en Windows, usa `http://host.docker.internal:11434`.
  - Si quieres levantar Ollama dentro del propio stack, usa `http://ollama:11434`
    y arranca Compose con `--profile ollama`.
