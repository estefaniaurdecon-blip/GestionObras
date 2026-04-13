# Backend FastAPI

API central multi-tenant de la plataforma.

## Responsabilidades

- Autenticacion y sesion con JWT `HS256`, MFA por email y cookies de confianza.
- RBAC y resolucion de permisos por rol.
- Modulos ERP, RRHH, mensajeria, branding, contratos, facturas y tickets.
- Workers de Celery para tareas diferidas.

## Cambios recientes reflejados en este arbol

- Se sustituyo `python-jose` por una implementacion interna acotada en
  `app/core/security.py`.
- Se introdujo `app/core/datetime.py` para centralizar UTC y dejar de usar
  `datetime.utcnow()` en codigo de produccion.
- Se corrigio el duplicado de `department_id` en ERP y se cubrio el flujo con
  tests HTTP.
- `app/services/erp_service.py` ya usa `model_fields_set` en el update de
  proyectos.
- `app/core/config.py` usa `http://localhost:11434` como valor local de
  `OLLAMA_BASE_URL`; en produccion debe sobreescribirse.

## Estructura

- `app/main.py`
  arranque de FastAPI y registro de routers.
- `app/api/`
  dependencias y routers versionados.
- `app/services/`
  logica de negocio.
- `app/models/`
  modelos SQLModel.
- `app/core/`
  configuracion, auditoria, JWT, fechas y seguridad.
- `app/workers/`
  tareas de Celery.
- `tests/`
  tests de API y dominio.

## Desarrollo local

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Variables base: copia `backend-fastapi/.env.example` a un `.env` local y
ajusta al entorno.

## Testing

Checks frecuentes:

- `python -m pytest`
- `python -m pytest tests/test_auth_flow.py`
- `python -m pytest tests/test_erp_projects_api.py`

Cobertura nueva en el arbol:

- auth JWT y expiracion
- proyectos ERP con `department_id`
- flujos ERP ya existentes

## Notas operativas

- El backend mantiene timestamps naive en UTC por compatibilidad con el modelo
  actual de base de datos.
- `infra/docker-compose.prod.yml` exige `OLLAMA_BASE_URL` explicito.
- Si se tocan rutas publicas o contratos API, actualiza tambien la
  documentacion externa correspondiente.

## Deuda conocida

- Queda trabajo pendiente en logging estructurado, correlation IDs y
  observabilidad.
- FastAPI y Starlette siguen emitiendo warnings en Python 3.14 por APIs
  deprecadas ajenas al codigo de negocio actual.
