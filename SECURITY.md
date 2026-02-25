# Notas de seguridad

## Higiene de secretos
- No subir claves, tokens ni contrasenas reales al repositorio.
- Usar archivos `*.example` como plantillas de configuracion local.
- Mantener valores reales solo en archivos ignorados (por ejemplo:
  `local.settings.json`, `.env.local`).

## Rotacion de claves
- Antes existio un `DOCINT_KEY` real en configuracion local de desarrollo.
- Rotar ambas claves en Azure Document Intelligence antes de continuar pruebas.
- Actualizar valores locales solo en archivos ignorados tras la rotacion.
