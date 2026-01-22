from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import init_db
from app.api.v1.router import api_router as api_v1_router


def create_app() -> FastAPI:
    """
    Crea y configura la instancia principal de FastAPI.

    Aqui se definen middlewares, rutas y cualquier configuracion global.
    """

    app = FastAPI(
        title="SaaS Multi-Tenant API",
        version="0.1.0",
        description="API principal de la plataforma SaaS multi-tenant.",
        debug=settings.debug,
    )

    cors_origins = [o for o in list(settings.frontend_cors_origins or []) if o and o != "*"]
    if settings.frontend_base_url and settings.frontend_base_url not in cors_origins:
        cors_origins.append(settings.frontend_base_url)
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        if origin not in cors_origins:
            cors_origins.append(origin)

    # Configuracion CORS basica.
    # En desarrollo permitimos localhost, pero no usamos "*" para que funcione con credenciales.
    allow_origins = cors_origins or ["http://localhost:5173", "http://127.0.0.1:5173"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Inicializamos la base de datos al arrancar.
    @app.on_event("startup")
    def on_startup() -> None:
        init_db()

    # Montamos rutas versionadas bajo `/api/v1`.
    app.include_router(api_v1_router, prefix="/api/v1")

    return app


app = create_app()
