Backend FastAPI - API central multi-tenant
===========================================

> Referencia unica de endpoints: `documentacion/ENDPOINTS_UNIFICADOS.md`.

Este servicio implementa la API principal de la plataforma SaaS.

Objetivos clave
---------------

- Arquitectura multi-tenant (`tenant_id` + aislamiento por permisos).
- Autenticacion JWT con MFA.
- RBAC (Super Admin, Tenant Admin y User).
- ERP operativo (proyectos, partes, accesos, maquinaria y tiempos).

Estructura base
---------------

- `app/main.py`: entrada de FastAPI y registro de routers.
- `app/api/*`: routers versionados.
- `app/services/*`: logica de negocio.
- `app/models/*`: modelos SQLModel.
- `app/core/*`: configuracion, seguridad y auditoria.

Desarrollo local
----------------

1. Crear entorno virtual.
2. Instalar dependencias: `pip install -r requirements.txt`.
3. Crear `.env` local con variables requeridas.
4. Ejecutar: `uvicorn app.main:app --reload`.

Notas operativas
----------------

- Este README no lista rutas para evitar duplicidad documental.
- Cualquier cambio de rutas debe reflejarse en
  `documentacion/ENDPOINTS_UNIFICADOS.md`.
- Recomendado para pruebas/CI: Python 3.11 o 3.12.
