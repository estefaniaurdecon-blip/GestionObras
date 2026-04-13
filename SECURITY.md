# Security

Resumen practico de la postura de seguridad actual del repo y del trabajo
pendiente que sigue abierto.

## Reporte de vulnerabilidades

Si detectas una vulnerabilidad o fuga de credenciales:

1. No publiques el secreto en issues ni commits.
2. Retira el valor del entorno activo.
3. Rota la credencial en el proveedor correspondiente.
4. Documenta el alcance y los sistemas afectados.
5. Planifica limpieza del historial si el secreto llego a Git.

## Higiene de secretos

- Usa solo archivos `*.example` como plantilla.
- Manten secretos reales en archivos ignorados o en secret stores del entorno.
- `azure-functions/docint-proxy/local.settings.json` debe permanecer local.
- No reutilices secretos de desarrollo en staging o produccion.

## Estado actual del arbol

Ya reflejado en el repo:

- `.gitignore` cubre mejor artefactos temporales y `local.settings*.json`.
- El backend ya no depende de `python-jose` para JWT.
- El valor local por defecto de `OLLAMA_BASE_URL` apunta a `localhost`.
- En produccion `OLLAMA_BASE_URL` es obligatorio.

## Acciones inmediatas recomendadas

Pendientes fuera del codigo:

- rotar secretos expuestos historicamente
- limpiar historial Git si hubo `.env` o credenciales reales versionadas
- revisar `local.settings.json` y entornos de despliegue antes de seguir

Secretos que merecen revision explicita si hubo exposicion:

- SMTP
- `DOCINT_KEY`
- `OPENAI_API_KEY`
- `TUNNEL_TOKEN`
- claves internas de backend y cookies

## Autenticacion

- Backend: JWT `HS256` propio y MFA por email.
- Cookies de sesion y confianza configurables via entorno.
- El codigo actual mantiene compatibilidad con timestamps UTC naive en BD.

## Observabilidad y hardening pendientes

Todavia no estan resueltos de extremo a extremo:

- logging estructurado JSON
- correlation IDs
- OpenTelemetry
- metricas y cobertura centralizadas

## Practicas recomendadas para contribuidores

- Si tocas seguridad o auth, actualiza tambien esta guia.
- Si rotas claves, no documentes el valor; documenta solo el procedimiento.
- Si introduces una nueva integracion externa, añade su superficie de secretos y
  su plan de rotacion.
