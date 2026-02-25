from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.audit import set_audit_source, reset_audit_source
from app.db.session import init_db
from app.api.v1.router import api_router as api_v1_router
from app.contracts.router import public_router as contracts_public_router


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

    localhost_defaults = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    )
    for origin in localhost_defaults:
        if origin not in cors_origins:
            cors_origins.append(origin)

    # Configuracion CORS basica: orígenes conocidos y un regex amplio para localhost en desarrollo.
    allow_origins = cors_origins or list(localhost_defaults)
    allow_origin_regex = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

    class AuditSourceMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            source = request.headers.get("X-Source") or "web"
            token = set_audit_source(source)
            try:
                response = await call_next(request)
            finally:
                reset_audit_source(token)
            return response

    # Primero el middleware de auditoria, luego CORS como capa exterior.
    app.add_middleware(AuditSourceMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_origin_regex=allow_origin_regex,
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
    # Endpoint publico para firma de contratos.
    app.include_router(contracts_public_router, prefix="/public")

    avatars_path = Path(settings.avatars_storage_path)
    avatars_path.mkdir(parents=True, exist_ok=True)
    app.mount("/static/avatars", StaticFiles(directory=str(avatars_path)), name="avatars")

    logos_path = Path(settings.logos_storage_path)
    logos_path.mkdir(parents=True, exist_ok=True)
    app.mount("/static/logos", StaticFiles(directory=str(logos_path)), name="logos")

    docs_path = Path(settings.project_docs_storage_path)
    docs_path.mkdir(parents=True, exist_ok=True)
    app.mount("/static/project-docs", StaticFiles(directory=str(docs_path)), name="project_docs")

    work_report_images_path = Path(settings.work_report_images_storage_path)
    work_report_images_path.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/static/work-report-images",
        StaticFiles(directory=str(work_report_images_path)),
        name="work_report_images",
    )

    shared_files_path = Path(settings.shared_files_storage_path)
    shared_files_path.mkdir(parents=True, exist_ok=True)
    return app


app = create_app()


