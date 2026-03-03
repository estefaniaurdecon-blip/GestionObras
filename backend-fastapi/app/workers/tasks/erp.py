import logging
from datetime import date
from typing import Optional

from app.services.work_report_autoclone_service import (
    run_auto_duplicate_rental_machinery_for_date,
)
from app.workers.celery_app import celery_app


logger = logging.getLogger("app.erp.jobs")


def _parse_run_date(run_date: Optional[str]) -> Optional[date]:
    if run_date is None:
        return None
    value = run_date.strip()
    if not value:
        return None
    return date.fromisoformat(value[:10])


@celery_app.task(name="app.workers.tasks.erp.auto_duplicate_rental_machinery_daily")
def auto_duplicate_rental_machinery_daily(
    run_date: Optional[str] = None,
    tenant_id: Optional[int] = None,
    force: bool = False,
    requested_by_user_id: Optional[int] = None,
) -> dict:
    target_date = _parse_run_date(run_date)
    result = run_auto_duplicate_rental_machinery_for_date(
        target_date=target_date,
        tenant_id=tenant_id,
        force=force,
        requested_by_user_id=requested_by_user_id,
    )
    logger.info(
        "auto_duplicate_rental_machinery_daily finished run_date=%s tenant_id=%s "
        "processed_tenants=%s created_reports=%s lock_skips=%s errors=%s",
        result.run_date,
        tenant_id,
        result.processed_tenants,
        result.created_reports,
        result.lock_skips,
        len(result.errors),
    )
    return result.to_dict()
