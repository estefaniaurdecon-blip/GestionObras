from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Configuración central de la aplicación.

    Todos los parámetros importantes se leen desde variables de entorno,
    lo que permite tener entornos local/staging/production sin cambiar código.
    """

    env: str = "local"
    debug: bool = False

    # Config base de datos (PostgreSQL)
    database_url: str

    # Config JWT
    secret_key: str
    access_token_expire_minutes: int = 1440
    algorithm: str = "HS256"
    auth_cookie_name: str = "access_token"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    allow_bootstrap_superadmin: bool = False
    superadmin_email: str
    superadmin_password: str

    # Config multi-tenant (por subdominio)
    primary_domain: str = "empresa.local"

    # Orígenes permitidos para CORS en frontend (solo producción).
    # Puede configurarse como lista JSON en FRONTEND_CORS_ORIGINS.
    frontend_cors_origins: List[str] = []

    # Config SMTP para envío de correos (opcional)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True

    # URL base del frontend para enlaces en correos
    frontend_base_url: str | None = None

    # IntegraciÑn con Moodle (Web Services)
    moodle_base_url: str | None = None
    moodle_token: str | None = None

    # Clave interna para crear notificaciones desde ERP
    saas_internal_api_key: str | None = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """
    Usamos `lru_cache` para que la configuración se cargue solo una vez
    por proceso, evitando re-lecturas innecesarias.
    """

    return Settings()


settings = get_settings()
