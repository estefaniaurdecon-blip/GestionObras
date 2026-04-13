# DocInt Proxy

Azure Function HTTP para procesar albaranes con Azure AI Document Intelligence.

## Flujo

`Cliente -> docint-proxy -> Azure DocInt -> JSON normalizado`

El proxy valida el bearer token contra el backend antes de invocar Document
Intelligence.

## Cambios recientes reflejados en este arbol

- `src/functions/processAlbaran.ts` se simplifico extrayendo logica pura.
- Las utilidades viven ahora en `src/functions/processAlbaran.utils.ts`.
- Hay base minima de tests en `tests/processAlbaran.utils.test.ts`.
- `npm test` ya forma parte de los scripts del paquete.
- `tsconfig.json` incluye `tests/**/*.ts`.

## Variables de entorno

- `DOCINT_ENDPOINT`
- `DOCINT_KEY`
- `DOCINT_API_VERSION`
- `DOCINT_MODEL_PRIMARY`
- `DOCINT_MODEL_FALLBACK`
- `DOCINT_LOCALE`
- `DOCINT_PAGES_LIMIT`
- `DOCINT_TIMEOUT_MS`
- `DOCINT_MAX_FILE_BYTES`
- `DOCINT_IS_F0`
- `API_BASE_URL`
- `API_AUTH_ME_PATH`
- `API_AUTH_ME_FALLBACK_PATH`
- `API_AUTH_TIMEOUT_MS`

Usa `local.settings.example.json` como plantilla. No subas
`local.settings.json`.

## Desarrollo local

```bash
npm install
npm run build
func start
```

Tests:

```bash
npm test
```

## Contrato HTTP

- Metodo: `POST`
- Content-Type: `multipart/form-data`
- Campo requerido: `file`
- Cabecera requerida: `Authorization: Bearer <token>`

Respuesta:

- `200`: documento procesado y normalizado
- `400`: solicitud invalida o archivo no soportado
- `401`: token ausente o no valido
- `429`: throttling de DocInt
- `500`: error de configuracion local
- `502`: fallo aguas arriba en auth o DocInt

## Notas de seguridad

- Los secretos reales deben vivir solo en App Settings o archivos ignorados.
- Si hubo exposicion previa de claves, rota `DOCINT_KEY` antes de seguir usando
  el recurso.
