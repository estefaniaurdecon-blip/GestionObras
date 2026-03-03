from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import settings
from app.db.session import engine
from app.models.erp import WorkReport
from app.models.job_run_lock import JobRunLock
from app.models.tenant import Tenant

AUTO_DUPLICATE_JOB_NAME = "auto_duplicate_rental_machinery_daily"

# Festivos nacionales de Espana usados por la implementacion legacy.
_SPANISH_HOLIDAYS = {
    date(2025, 1, 1),
    date(2025, 1, 6),
    date(2025, 4, 18),
    date(2025, 5, 1),
    date(2025, 8, 15),
    date(2025, 10, 12),
    date(2025, 11, 1),
    date(2025, 12, 6),
    date(2025, 12, 8),
    date(2025, 12, 25),
    date(2026, 1, 1),
    date(2026, 1, 6),
    date(2026, 4, 3),
    date(2026, 5, 1),
    date(2026, 8, 15),
    date(2026, 10, 12),
    date(2026, 11, 1),
    date(2026, 12, 6),
    date(2026, 12, 8),
    date(2026, 12, 25),
}


@dataclass
class AutoCloneRunResult:
    job_name: str
    run_date: str
    target_tenants: list[int] = field(default_factory=list)
    processed_tenants: int = 0
    created_reports: int = 0
    skipped_existing: int = 0
    disabled_flags: int = 0
    lock_skips: int = 0
    skipped_non_business_day: bool = False
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _now_utc_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _is_business_day(target_date: date) -> bool:
    return target_date.weekday() < 5 and target_date not in _SPANISH_HOLIDAYS


def _normalize_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def _parse_date(value: Any) -> Optional[date]:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None
    return None


def _to_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _is_payload_autoclone_enabled(payload: dict[str, Any]) -> bool:
    raw = payload.get("autoCloneNextDay")
    if raw is None:
        raw = payload.get("auto_clone_next_day")
    return bool(raw)


def _set_payload_autoclone(payload: dict[str, Any], enabled: bool) -> None:
    payload["autoCloneNextDay"] = enabled
    if "auto_clone_next_day" in payload:
        payload["auto_clone_next_day"] = enabled


def _extract_work_identity(report: WorkReport) -> str:
    payload = report.payload if isinstance(report.payload, dict) else {}

    work_number = _normalize_text(payload.get("workNumber") or payload.get("work_number"))
    work_id = _normalize_text(payload.get("workId") or payload.get("work_id"))
    work_name = _normalize_text(payload.get("workName") or payload.get("work_name") or report.title)

    if work_number and work_id:
        return f"work::{work_number}::{work_id}"
    if work_number:
        return f"work-number::{work_number}"
    if work_id:
        return f"work-id::{work_id}"
    if work_name:
        return f"work-name::{work_name}"
    return f"report-id::{report.id}"


def _remove_document_images_from_groups(groups: Any) -> Any:
    if not isinstance(groups, list):
        return groups

    cleaned: list[Any] = []
    for group in groups:
        if not isinstance(group, dict):
            cleaned.append(group)
            continue

        next_group = deepcopy(group)
        next_group.pop("documentImage", None)
        next_group.pop("document_image", None)

        items = next_group.get("items")
        if isinstance(items, list):
            cleaned_items: list[Any] = []
            for item in items:
                if not isinstance(item, dict):
                    cleaned_items.append(item)
                    continue
                next_item = deepcopy(item)
                next_item.pop("documentImage", None)
                next_item.pop("document_image", None)
                cleaned_items.append(next_item)
            next_group["items"] = cleaned_items

        cleaned.append(next_group)

    return cleaned


def _working_days_between(start_date: date, end_date: date) -> int:
    if start_date > end_date:
        return 0

    days = 0
    cursor = start_date
    while cursor <= end_date:
        if _is_business_day(cursor):
            days += 1
        cursor += timedelta(days=1)
    return days


def _update_rental_groups_for_clone(payload: dict[str, Any], target_date: date) -> None:
    key = "rentalMachineryGroups" if "rentalMachineryGroups" in payload else "rental_machinery_groups"
    groups = payload.get(key)
    if not isinstance(groups, list):
        return

    active_groups: list[Any] = []
    for group in groups:
        if not isinstance(group, dict):
            continue

        items = group.get("items")
        if not isinstance(items, list):
            continue

        active_items: list[Any] = []
        for item in items:
            if not isinstance(item, dict):
                continue

            delivery_date = _parse_date(item.get("deliveryDate") or item.get("delivery_date"))
            removal_date = _parse_date(item.get("removalDate") or item.get("removal_date"))
            if delivery_date is None:
                continue
            if removal_date is not None and removal_date < target_date:
                continue

            next_item = deepcopy(item)
            total_days = _working_days_between(delivery_date, target_date)
            next_item["totalDays"] = total_days
            if "total_days" in next_item:
                next_item["total_days"] = total_days

            daily_rate = _to_float(next_item.get("dailyRate"))
            if daily_rate is None:
                daily_rate = _to_float(next_item.get("daily_rate"))
            if daily_rate is not None:
                next_item["total"] = round(daily_rate * total_days, 2)

            assignments = next_item.get("assignments")
            if isinstance(assignments, list):
                updated_assignments: list[Any] = []
                for assignment in assignments:
                    if not isinstance(assignment, dict):
                        updated_assignments.append(assignment)
                        continue

                    next_assignment = deepcopy(assignment)
                    start_date = _parse_date(
                        next_assignment.get("startDate") or next_assignment.get("start_date")
                    )
                    end_date = _parse_date(
                        next_assignment.get("endDate") or next_assignment.get("end_date")
                    )

                    if start_date is not None and (end_date is None or end_date >= target_date):
                        next_assignment["days"] = _working_days_between(start_date, target_date)

                    updated_assignments.append(next_assignment)

                next_item["assignments"] = updated_assignments

            active_items.append(next_item)

        if active_items:
            next_group = deepcopy(group)
            next_group["items"] = active_items
            active_groups.append(next_group)

    if active_groups:
        payload[key] = active_groups
        mirror_key = "rental_machinery_groups" if key == "rentalMachineryGroups" else "rentalMachineryGroups"
        if mirror_key in payload:
            payload[mirror_key] = deepcopy(active_groups)


def _build_cloned_payload(source_payload: dict[str, Any], target_date: date) -> dict[str, Any]:
    cloned_payload = deepcopy(source_payload)
    cloned_payload["date"] = target_date.isoformat()

    if "siteManagerSignature" in cloned_payload or "site_manager_signature" in cloned_payload:
        cloned_payload["siteManagerSignature"] = ""
        if "site_manager_signature" in cloned_payload:
            cloned_payload["site_manager_signature"] = ""

    _set_payload_autoclone(cloned_payload, False)

    for key in ("materialGroups", "material_groups"):
        if key in cloned_payload:
            cloned_payload[key] = []

    for key in ("workGroups", "work_groups", "machineryGroups", "machinery_groups", "subcontractGroups", "subcontract_groups"):
        if key in cloned_payload:
            cloned_payload[key] = _remove_document_images_from_groups(cloned_payload.get(key))

    _update_rental_groups_for_clone(cloned_payload, target_date)
    return cloned_payload


def _load_target_tenants(session: Session, tenant_id: Optional[int]) -> list[Tenant]:
    if tenant_id is not None:
        tenant = session.get(Tenant, tenant_id)
        if not tenant or not tenant.is_active:
            return []
        return [tenant]

    return session.exec(select(Tenant).where(Tenant.is_active.is_(True))).all()


def _acquire_job_lock(
    session: Session,
    *,
    tenant_id: int,
    run_date: date,
    detail: str,
) -> Optional[JobRunLock]:
    lock = JobRunLock(
        tenant_id=tenant_id,
        job_name=AUTO_DUPLICATE_JOB_NAME,
        run_date=run_date,
        status="running",
        detail=detail[:512],
        created_at=_now_utc_naive(),
    )
    session.add(lock)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        return None
    session.refresh(lock)
    return lock


def _finalize_job_lock(session: Session, lock: JobRunLock, *, status: str, detail: str) -> None:
    lock.status = status[:32]
    lock.detail = detail[:512]
    lock.completed_at = _now_utc_naive()
    session.add(lock)
    session.commit()


def _run_for_tenant(
    session: Session,
    *,
    tenant_id: int,
    target_date: date,
    requested_by_user_id: Optional[int],
) -> tuple[int, int, int]:
    now = _now_utc_naive()
    created_reports = 0
    skipped_existing = 0
    disabled_flags = 0

    today_reports = session.exec(
        select(WorkReport).where(
            WorkReport.tenant_id == tenant_id,
            WorkReport.date == target_date,
            WorkReport.deleted_at.is_(None),
        )
    ).all()
    identities_today = {_extract_work_identity(report) for report in today_reports}

    candidates = session.exec(
        select(WorkReport).where(
            WorkReport.tenant_id == tenant_id,
            WorkReport.deleted_at.is_(None),
            WorkReport.date < target_date,
        ).order_by(WorkReport.date.desc(), WorkReport.updated_at.desc())
    ).all()

    for report in candidates:
        payload = dict(report.payload or {})
        if not _is_payload_autoclone_enabled(payload):
            continue

        identity = _extract_work_identity(report)

        updated_payload = deepcopy(payload)
        _set_payload_autoclone(updated_payload, False)
        report.payload = updated_payload
        report.updated_at = now
        if requested_by_user_id is not None:
            report.updated_by_id = requested_by_user_id
        session.add(report)
        disabled_flags += 1

        if identity in identities_today:
            skipped_existing += 1
            continue

        clone_payload = _build_cloned_payload(payload, target_date)
        cloned_report = WorkReport(
            tenant_id=report.tenant_id,
            project_id=report.project_id,
            external_id=None,
            report_identifier=report.report_identifier,
            idempotency_key=None,
            title=report.title,
            date=target_date,
            status=report.status,
            is_closed=report.is_closed,
            payload=clone_payload,
            created_by_id=report.created_by_id,
            updated_by_id=requested_by_user_id if requested_by_user_id is not None else report.updated_by_id,
            created_at=now,
            updated_at=now,
        )
        session.add(cloned_report)
        identities_today.add(identity)
        created_reports += 1

    session.commit()
    return created_reports, skipped_existing, disabled_flags


def _resolve_default_run_date() -> date:
    timezone_name = settings.celery_timezone or "Europe/Madrid"
    return datetime.now(ZoneInfo(timezone_name)).date()


def run_auto_duplicate_rental_machinery_for_date(
    target_date: Optional[date],
    tenant_id: Optional[int] = None,
    *,
    force: bool = False,
    requested_by_user_id: Optional[int] = None,
) -> AutoCloneRunResult:
    resolved_date = target_date or _resolve_default_run_date()
    result = AutoCloneRunResult(
        job_name=AUTO_DUPLICATE_JOB_NAME,
        run_date=resolved_date.isoformat(),
    )

    if not force and not _is_business_day(resolved_date):
        result.skipped_non_business_day = True
        return result

    with Session(engine) as session:
        tenants = _load_target_tenants(session, tenant_id)
        result.target_tenants = [tenant.id for tenant in tenants]

        for tenant in tenants:
            lock = _acquire_job_lock(
                session,
                tenant_id=tenant.id,
                run_date=resolved_date,
                detail=f"requested_by={requested_by_user_id or 'system'}",
            )
            if lock is None:
                result.lock_skips += 1
                continue

            try:
                created, skipped, disabled = _run_for_tenant(
                    session,
                    tenant_id=tenant.id,
                    target_date=resolved_date,
                    requested_by_user_id=requested_by_user_id,
                )
                result.created_reports += created
                result.skipped_existing += skipped
                result.disabled_flags += disabled
                result.processed_tenants += 1
                _finalize_job_lock(
                    session,
                    lock,
                    status="completed",
                    detail=(
                        f"created={created},skipped_existing={skipped},"
                        f"disabled_flags={disabled}"
                    ),
                )
            except Exception as exc:  # pragma: no cover - defensivo
                session.rollback()
                result.errors.append(f"tenant={tenant.id}: {exc}")
                _finalize_job_lock(
                    session,
                    lock,
                    status="failed",
                    detail=str(exc),
                )

    return result
