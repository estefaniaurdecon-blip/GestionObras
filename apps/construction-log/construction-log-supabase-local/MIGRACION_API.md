# Migracion de Supabase a API propia

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Estado

- Cliente API propio activo en `src/integrations/api/`.
- Autenticacion migrada a JWT/MFA.
- Hooks principales de obras migrados.
- Quedan modulos heredados con `supabase.functions.invoke(...)` pendientes de corte por fases.

## Regla documental

- Este archivo no lista rutas concretas para evitar duplicidad.
- Las rutas vigentes y las de migracion se documentan solo en `documentacion/ENDPOINTS_UNIFICADOS.md`.

## Verificacion funcional minima

1. Login/MFA operativo.
2. Carga de obras operativa.
3. CRUD de obras operativo.
4. Sin llamadas en ejecucion a dominios `*.supabase.co` en flujos migrados.
