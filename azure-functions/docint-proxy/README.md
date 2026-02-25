# DocInt Proxy (Azure Functions)

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

Proxy HTTP para procesar albaranes con Azure AI Document Intelligence.
Android sube el archivo al proxy y el proxy invoca DocInt con secretos
guardados solo en App Settings.

## Flujo

`Tablet Android -> docint-proxy -> REST DocInt -> JSON normalizado -> revision/aplicar en UI`

## Variables de entorno

- `DOCINT_ENDPOINT`
- `DOCINT_KEY`
- `DOCINT_API_VERSION`
- `DOCINT_MODEL_PRIMARY`
- `DOCINT_MODEL_FALLBACK`
- `DOCINT_LOCALE`
- `DOCINT_PAGES_LIMIT` (opcional)
- `DOCINT_TIMEOUT_MS`
- `DOCINT_IS_F0` (opcional)

Validacion de autenticacion contra backend:

- `API_BASE_URL`
- `API_AUTH_ME_PATH`
- `API_AUTH_ME_FALLBACK_PATH`
- `API_AUTH_TIMEOUT_MS`

## Ejecucion local

1. `npm install`
2. Copiar `local.settings.example.json` a `local.settings.json` y completar valores.
3. `npm run build`
4. `func start`

## Solicitud y respuesta

- Solicitud: `multipart/form-data` con `file`.
- Cabecera requerida: `Authorization: Bearer <token>`.
- Respuesta: JSON normalizado de albaran (proveedor, fecha, numero, items, warnings).

## Errores esperables

- `400`: solicitud invalida.
- `401`: token invalido o ausente.
- `500`: error interno o de configuracion.
- `502`: fallo de servicio aguas arriba (auth o DocInt).
