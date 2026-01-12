Backend FastAPI - Core API multi-tenant
=======================================

Este servicio implementa la API principal de la plataforma SaaS multi-tenant.

Objetivos clave:
- Multi-tenant (tenant por subdominio o `tenant_id`).
- Autenticación JWT con MFA.
- RBAC (Super Admin, Tenant Admin, User).
- Gestión de tenants, usuarios y herramientas.

Estructura básica (carpeta `app`):
- `main.py`          -> Punto de entrada FastAPI.
- `core/config.py`   -> Configuración basada en variables de entorno.
- `core/security.py` -> Lógica de seguridad (hash contraseñas, JWT, MFA).
- `db/session.py`    -> Conexión a base de datos y sesión.
- `db/base.py`       -> Registro central de modelos SQLModel.
- `models/*`         -> Modelos de base de datos (tenants, users, roles, tools...).
- `api/deps.py`      -> Dependencias comunes (usuario actual, tenant actual...).
- `api/v1/*`         -> Rutas versionadas (auth, tenants, users, tools, health).

Para desarrollo local:
1. Crear un entorno virtual.
2. Instalar dependencias con `pip install -r requirements.txt`.
3. Crear un fichero `.env` basado en `.env.example`.
4. Ejecutar `uvicorn app.main:app --reload`.

