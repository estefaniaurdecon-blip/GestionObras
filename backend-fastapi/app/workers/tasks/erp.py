import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlmodel import Session, select

from app.db.session import engine
from app.models.erp import Project, RentalMachinery, WorkReport
from app.models.notification import NotificationType
from app.models.user import User
from app.models.user_work_assignment import UserWorkAssignment
from app.services.notification_service import create_notification_once, notification_exists
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


def _list_active_tenant_user_ids(session: Session, *, tenant_id: int) -> list[int]:
    return [
        int(user_id)
        for user_id in session.exec(
            select(User.id).where(
                User.tenant_id == tenant_id,
                User.is_super_admin.is_(False),
                User.is_active.is_(True),
            )
        ).all()
        if user_id is not None
    ]


def _list_project_recipient_user_ids(
    session: Session,
    *,
    tenant_id: int,
    project_id: int,
) -> list[int]:
    project_user_ids = [
        int(user_id)
        for user_id in session.exec(
            select(User.id)
            .join(UserWorkAssignment, UserWorkAssignment.user_id == User.id)
            .where(
                UserWorkAssignment.tenant_id == tenant_id,
                UserWorkAssignment.project_id == project_id,
                User.tenant_id == tenant_id,
                User.is_super_admin.is_(False),
                User.is_active.is_(True),
            )
        ).all()
        if user_id is not None
    ]
    if project_user_ids:
        return sorted(set(project_user_ids))
    return sorted(set(_list_active_tenant_user_ids(session, tenant_id=tenant_id)))


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


@celery_app.task(name="app.workers.tasks.erp.send_weekly_open_work_reports_summary")
def send_weekly_open_work_reports_summary(
    run_date: Optional[str] = None,
    tenant_id: Optional[int] = None,
) -> dict:
    target_date = _parse_run_date(run_date) or date.today()
    week_token = target_date.strftime("%G-W%V")

    with Session(engine) as session:
        tenant_ids = (
            [tenant_id]
            if tenant_id is not None
            else [
                int(row_tenant_id)
                for row_tenant_id in session.exec(
                    select(WorkReport.tenant_id).distinct(),
                ).all()
                if row_tenant_id is not None
            ]
        )

        notifications_created = 0
        tenants_processed = 0
        open_reports_total = 0

        for current_tenant_id in sorted(set(tenant_ids)):
            total_open_reports = session.exec(
                select(func.count())
                .select_from(WorkReport)
                .where(
                    WorkReport.tenant_id == current_tenant_id,
                    WorkReport.deleted_at.is_(None),
                    WorkReport.is_closed.is_(False),
                )
            ).one()
            total_open_reports = int(total_open_reports or 0)
            if total_open_reports <= 0:
                continue

            tenants_processed += 1
            open_reports_total += total_open_reports
            for user_id in _list_active_tenant_user_ids(session, tenant_id=current_tenant_id):
                reference = f"weekly_open_work_reports:{week_token}"
                if notification_exists(
                    session,
                    tenant_id=current_tenant_id,
                    user_id=user_id,
                    type=NotificationType.WORK_REPORT_PENDING,
                    reference=reference,
                ):
                    continue
                create_notification_once(
                    session,
                    tenant_id=current_tenant_id,
                    user_id=user_id,
                    type=NotificationType.WORK_REPORT_PENDING,
                    title="Resumen semanal de partes sin cerrar",
                    body=(
                        f"Actualmente hay {total_open_reports} partes totales sin cerrar "
                        "pendientes de revision o cierre."
                    ),
                    reference=reference,
                )
                notifications_created += 1

        logger.info(
            "send_weekly_open_work_reports_summary finished target_date=%s tenant_id=%s "
            "tenants_processed=%s open_reports_total=%s notifications_created=%s",
            target_date.isoformat(),
            tenant_id,
            tenants_processed,
            open_reports_total,
            notifications_created,
        )
        return {
            "run_date": target_date.isoformat(),
            "tenant_id": tenant_id,
            "tenants_processed": tenants_processed,
            "open_reports_total": open_reports_total,
            "notifications_created": notifications_created,
        }


@celery_app.task(name="app.workers.tasks.erp.send_rental_machinery_expiry_warnings")
def send_rental_machinery_expiry_warnings(
    run_date: Optional[str] = None,
    tenant_id: Optional[int] = None,
    warning_days: int = 7,
) -> dict:
    target_date = _parse_run_date(run_date) or date.today()
    warning_end_date = target_date + timedelta(days=max(1, warning_days))

    with Session(engine) as session:
        stmt = select(RentalMachinery).where(
            RentalMachinery.deleted_at.is_(None),
            RentalMachinery.is_rental.is_(True),
            RentalMachinery.status == "active",
            RentalMachinery.end_date.is_not(None),
            RentalMachinery.end_date >= target_date,
            RentalMachinery.end_date <= warning_end_date,
        )
        if tenant_id is not None:
            stmt = stmt.where(RentalMachinery.tenant_id == tenant_id)

        machinery_rows = session.exec(stmt.order_by(RentalMachinery.end_date.asc())).all()
        notifications_created = 0

        for machinery in machinery_rows:
            project = session.get(Project, machinery.project_id)
            project_name = project.name if project else f"Obra {machinery.project_id}"
            end_date_label = machinery.end_date.isoformat() if machinery.end_date else "sin fecha"
            recipient_ids = _list_project_recipient_user_ids(
                session,
                tenant_id=machinery.tenant_id,
                project_id=machinery.project_id,
            )
            for user_id in recipient_ids:
                reference = f"rental_machinery_expiry:{machinery.id}:{target_date.isoformat()}"
                if notification_exists(
                    session,
                    tenant_id=machinery.tenant_id,
                    user_id=user_id,
                    type=NotificationType.MACHINERY_EXPIRY_WARNING,
                    reference=reference,
                ):
                    continue
                create_notification_once(
                    session,
                    tenant_id=machinery.tenant_id,
                    user_id=user_id,
                    type=NotificationType.MACHINERY_EXPIRY_WARNING,
                    title=f"Alquiler a punto de caducar: {machinery.name}",
                    body=(
                        f'La maquinaria "{machinery.name}" de la obra "{project_name}" '
                        f"caduca el {end_date_label}."
                    ),
                    reference=reference,
                )
                if machinery.end_date is not None:
                    notifications_created += 1

        logger.info(
            "send_rental_machinery_expiry_warnings finished target_date=%s tenant_id=%s "
            "machinery_rows=%s notifications_created=%s",
            target_date.isoformat(),
            tenant_id,
            len(machinery_rows),
            notifications_created,
        )
        return {
            "run_date": target_date.isoformat(),
            "tenant_id": tenant_id,
            "warning_days": warning_days,
            "machinery_rows": len(machinery_rows),
            "notifications_created": notifications_created,
        }
