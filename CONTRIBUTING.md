# Contribuir

Guia breve para trabajar en este monorepo sin perder contexto ni introducir
deuda nueva.

## Antes de tocar codigo

- Revisa el `git status` y evita pisar cambios ajenos.
- Usa archivos `*.example` como base de configuracion.
- No subas `local.settings.json`, `.env` reales ni dumps temporales.

## Workdirs recomendados

- Backend: `backend-fastapi`
- Frontend wrapper: `apps/construction-log`
- Frontend app directa: `apps/construction-log/construction-log-supabase-local`
- Azure Functions: `azure-functions/docint-proxy`
- Infra: `infra`

## Checks minimos por zona

### Frontend

- `npm run build`
- `npm run lint:changed`

`npm run lint` sigue siendo util como chequeo amplio, pero el gate incremental
oficial para trabajo diario es `lint:changed`.

### Backend

- `python -m pytest`

Si el cambio es acotado, ejecuta al menos la suite del modulo tocado.

### Azure Functions

- `npm test`

## Cambios que deben venir con documentacion

Actualiza README o documentacion cuando cambies cualquiera de estos puntos:

- estructura de carpetas o ownership tecnico
- comandos de desarrollo o testing
- contratos HTTP o variables de entorno
- politicas de seguridad, auth o gestion de secretos
- despliegue o dependencias operativas obligatorias

## Convenciones practicas

- Prefiere cambios incrementales y testeables.
- Si introduces un helper compartido, intenta mover la logica duplicada hacia
  ese punto comun.
- Si tocas fechas en backend, usa `app/core/datetime.py`.
- Si tocas JWT en backend, mantente dentro del contrato `HS256` actual salvo
  refactorizacion deliberada.
- Si modularizas frontend, documenta la nueva ubicacion de componentes y hooks.

## Seguridad y secretos

- Nunca commitees credenciales reales.
- Si detectas una exposicion historica, no la “arregles” solo cambiando el
  valor local: rota el secreto y planifica limpieza del historial.
- Para detalles, revisa `SECURITY.md`.
