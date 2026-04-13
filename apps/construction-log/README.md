# Frontend Wrapper

Workdir recomendado para desarrollo del frontend:
`apps/construction-log`

Este directorio actua como wrapper del proyecto real Vite/React ubicado en
`apps/construction-log/construction-log-supabase-local`.

## Scripts utiles

```bash
npm run install:app
npm run dev
npm run build
npm run lint
npm run tsc
```

La app real corre por defecto en `http://localhost:8080`.

## Estado actual del frontend

El arbol refleja una modularizacion en progreso:

- componentes grandes se estan dividiendo por dominio
- aparecen subdirectorios como `economic-management/`, `work-management/`,
  `work-postventas/`, `work-repasos/` y `tools-panel/parts-tab/`
- la logica de partes y escaneo se esta moviendo a hooks especializados

Para detalles operativos y de estructura interna revisa el README del proyecto
real:

- [construction-log-supabase-local/README.md](construction-log-supabase-local/README.md)
