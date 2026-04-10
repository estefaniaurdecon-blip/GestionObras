from celery import Celery
from celery.schedules import crontab

from app.core.config import settings
from app.db import base  # noqa: F401  Importa modelos para el worker


celery_app = Celery(
    "saas_app",
    broker=settings.celery_broker_url,
)

# Configuracion global de Celery.
celery_app.conf.update(
    broker_connection_retry_on_startup=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_track_started=True,
    timezone=settings.celery_timezone,
    task_soft_time_limit=settings.celery_soft_time_limit_seconds,
    task_time_limit=settings.celery_time_limit_seconds,
    broker_transport_options={
        "visibility_timeout": settings.celery_visibility_timeout_seconds,
    },
)

# Programacion de tareas recurrentes.
celery_app.conf.beat_schedule = {
    "send_due_reminders_daily": {
        "task": "app.workers.tasks.invoices.send_due_reminders",
        "schedule": crontab(minute=0, hour=7),
    },
    "auto_duplicate_rental_machinery_daily": {
        "task": "app.workers.tasks.erp.auto_duplicate_rental_machinery_daily",
        "schedule": crontab(minute=0, hour=6),
    },
    "send_rental_machinery_expiry_warnings_daily": {
        "task": "app.workers.tasks.erp.send_rental_machinery_expiry_warnings",
        "schedule": crontab(minute=15, hour=7),
    },
    "send_weekly_open_work_reports_summary": {
        "task": "app.workers.tasks.erp.send_weekly_open_work_reports_summary",
        "schedule": crontab(minute=30, hour=7, day_of_week="mon"),
    },
    "ai_health_check": {
        "task": "app.workers.tasks.health.ai_health_check",
        "schedule": crontab(minute="*/3"),
    },
}

celery_app.conf.update(
    include=[
        "app.workers.tasks.invoices",
        "app.workers.tasks.health",
        "app.workers.tasks.contracts",
        "app.workers.tasks.erp",
    ]
)
