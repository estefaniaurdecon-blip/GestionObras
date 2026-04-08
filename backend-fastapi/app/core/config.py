from functools import lru_cache
import json
from pathlib import Path
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """
    Configuración central de la aplicación.

    Todos los parámetros importantes se leen desde variables de entorno,
    lo que permite tener entornos local/staging/production sin cambiar código.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

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
    mfa_trust_cookie_name: str = "mfa_trust_token"
    mfa_trust_hours: int = 24
    superadmin_refresh_cookie_name: str = "superadmin_refresh_token"
    superadmin_refresh_hours: int = 720
    allow_bootstrap_superadmin: bool = False
    superadmin_email: str
    superadmin_password: str

    # Config multi-tenant (por subdominio)
    primary_domain: str = "empresa.local"

    # Orígenes permitidos para CORS en frontend (solo producción).
    # Puede configurarse como lista JSON en FRONTEND_CORS_ORIGINS.
    frontend_cors_origins: List[str] = []

    # Config SMTP para envío de correos (opcional) — MFA, invitaciones, etc.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True

    # SMTP alternativo exclusivo para emails de recuperación de contraseña (opcional)
    # Si no se configura, se usa el SMTP principal.
    reset_smtp_host: str | None = None
    reset_smtp_port: int = 587
    reset_smtp_username: str | None = None
    reset_smtp_password: str | None = None
    reset_smtp_from: str | None = None
    reset_smtp_use_tls: bool = True

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
    ollama_timeout_secs: int = 60
    ollama_ocr_timeout_seconds: int = 90
    ollama_json_timeout_seconds: int = 45
    ai_circuit_breaker_ttl_seconds: int = 60
    ai_health_check_timeout_seconds: int = 5
    ai_help_llm_enabled: bool = True
    ollama_help_model: str | None = None
    ollama_help_timeout_seconds: int = 8
    lovable_api_key: str | None = None

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
    work_report_images_storage_path: str = str(BASE_DIR / "data" / "work-report-images")
    shared_files_storage_path: str = str(BASE_DIR / "data" / "shared-files")
    default_brand_accent_color: str = "#00662b"

    # Integracion con Moodle (Web Services)
    moodle_base_url: str | None = None
    moodle_token: str | None = None

    # Clave interna para crear notificaciones desde ERP
    saas_internal_api_key: str | None = None

    # Actualizaciones de app (replace check-updates Supabase function)
    app_updates_catalog_json: str | None = None
    app_updates_disabled_versions: List[str] = []

    @staticmethod
    def _coerce_bool_like(value):
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

    @model_validator(mode="before")
    @classmethod
    def normalize_bool_like_fields(cls, data):
        if not isinstance(data, dict):
            return data

        for field_name in (
            "debug",
            "auth_cookie_secure",
            "smtp_use_tls",
            "allow_bootstrap_superadmin",
            "ai_help_llm_enabled",
        ):
            if field_name in data:
                data[field_name] = cls._coerce_bool_like(data[field_name])
        return data

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value):
        return cls._coerce_bool_like(value)

    @field_validator("app_updates_disabled_versions", mode="before")
    @classmethod
    def parse_app_updates_disabled_versions(cls, value):
        if value is None:
            return []

        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []

            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass

            return [item.strip() for item in raw.split(",") if item.strip()]

        if isinstance(value, (set, tuple)):
            return [str(item).strip() for item in value if str(item).strip()]

        return value


@lru_cache
def get_settings() -> Settings:
    """
    Usamos `lru_cache` para que la configuración se cargue solo una vez
    por proceso, evitando re-lecturas innecesarias.
    """

    return Settings()


settings = get_settings()
