# Contribuir

## Gates mínimos de calidad

Para cambios en frontend (`apps/construction-log/construction-log-supabase-local`), los checks obligatorios son:

1. `npm run build`
2. `npm run lint:changed`

`npm run lint` se mantiene como lint completo del repositorio frontend, pero puede fallar por deuda histórica y no bloquea por sí solo este flujo incremental.

## Política de lint incremental

- `lint:changed` ejecuta ESLint solo sobre archivos JS/TS modificados respecto a `HEAD`.
- Si no hay archivos JS/TS modificados, el comando finaliza en éxito sin ejecutar ESLint global.
- El objetivo es evitar introducir deuda nueva mientras se migra el código legado por fases.
