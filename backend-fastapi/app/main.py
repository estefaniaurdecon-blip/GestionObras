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

    cors_origins = settings.frontend_cors_origins
    if not cors_origins and settings.frontend_base_url:
        cors_origins = [settings.frontend_base_url]

    # Configuracion CORS basica.
    # En produccion se deben restringir los origenes permitidos.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
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
