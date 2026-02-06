from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parents[2]


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

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_timezone: str = "Europe/Madrid"
    celery_visibility_timeout_seconds: int = 3600
    celery_soft_time_limit_seconds: int = 600
    celery_time_limit_seconds: int = 720

    # IA (Ollama remoto)
    ollama_base_url: str = "http://192.168.1.171:11434"
    ollama_headers_json: str | None = None
    ollama_ocr_model: str = "deepseek-ocr:3b"
    ollama_json_model: str = "qwen3-coder:30b"
    ollama_ocr_timeout_seconds: int = 90
    ollama_json_timeout_seconds: int = 45
    ai_circuit_breaker_ttl_seconds: int = 60
    ai_health_check_timeout_seconds: int = 5

    # Facturas
    invoices_storage_path: str = "/data/invoices"
    invoice_min_text_length: int = 80
    reminders_daily_enabled: bool = True
    reminders_daily_threshold: int = 5
    invoice_created_extra_recipients: List[str] = []
    invoice_due_base_recipients: List[str] = []
    invoice_due_extra_recipients_10: List[str] = []
    invoice_due_extra_recipients_5: List[str] = []

    # Contratos
    contracts_storage_path: str = "/data/contracts"
    signature_request_ttl_hours: int = 168
    public_api_base_url: str | None = None

    # Avatares y branding
    avatars_storage_path: str = str(BASE_DIR / "data" / "avatars")
    logos_storage_path: str = str(BASE_DIR / "data" / "logos")
    project_docs_storage_path: str = str(BASE_DIR / "data" / "project-docs")
    default_brand_accent_color: str = "#00662b"

    # IntegraciÑn con Moodle (Web Services)
    moodle_base_url: str | None = None
    moodle_token: str | None = None

    # Clave interna para crear notificaciones desde ERP
    saas_internal_api_key: str | None = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"1", "true", "yes", "y", "on"}:
                return True
            if lowered in {"0", "false", "no", "n", "off", "warn", "warning", "info", "error", "critical"}:
                return False
        return bool(value)


@lru_cache
def get_settings() -> Settings:
    """
    Usamos `lru_cache` para que la configuración se cargue solo una vez
    por proceso, evitando re-lecturas innecesarias.
    """

    return Settings()


settings = get_settings()
