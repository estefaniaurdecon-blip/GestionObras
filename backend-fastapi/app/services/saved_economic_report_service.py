from datetime import datetime
from app.core.datetime import utc_now

from sqlmodel import Session, select, func

from app.models.saved_economic_report import SavedEconomicReport
from app.schemas.saved_economic_report import (
    SavedEconomicReportCreate,
    SavedEconomicReportListResponse,
    SavedEconomicReportRead,
)


def list_saved_economic_reports(
    session: Session,
    *,
    tenant_id: int,
    limit: int = 200,
    offset: int = 0,
) -> SavedEconomicReportListResponse:
    count_stmt = (
        select(func.count())
        .select_from(SavedEconomicReport)
        .where(SavedEconomicReport.tenant_id == tenant_id)
    )
    total = session.exec(count_stmt).one()

    stmt = (
        select(SavedEconomicReport)
        .where(SavedEconomicReport.tenant_id == tenant_id)
        .order_by(SavedEconomicReport.date.desc())
        .offset(offset)
        .limit(limit)
    )
    items = session.exec(stmt).all()

    return SavedEconomicReportListResponse(
        items=[SavedEconomicReportRead.model_validate(r, from_attributes=True) for r in items],
        total=total,
    )


def upsert_saved_economic_report(
    session: Session,
    *,
    tenant_id: int,
    user_id: str,
    payload: SavedEconomicReportCreate,
) -> SavedEconomicReportRead:
    stmt = (
        select(SavedEconomicReport)
        .where(
            SavedEconomicReport.tenant_id == tenant_id,
            SavedEconomicReport.work_report_id == payload.work_report_id,
        )
    )
    existing = session.exec(stmt).first()

    if existing:
        existing.work_name = payload.work_name
        existing.work_number = payload.work_number
        existing.date = payload.date
        existing.foreman = payload.foreman
        existing.site_manager = payload.site_manager
        existing.work_groups = payload.work_groups
        existing.machinery_groups = payload.machinery_groups
        existing.material_groups = payload.material_groups
        existing.subcontract_groups = payload.subcontract_groups
        existing.rental_machinery_groups = payload.rental_machinery_groups
        existing.total_amount = payload.total_amount
        existing.updated_at = utc_now()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return SavedEconomicReportRead.model_validate(existing, from_attributes=True)

    report = SavedEconomicReport(
        tenant_id=tenant_id,
        work_report_id=payload.work_report_id,
        saved_by=user_id,
        work_name=payload.work_name,
        work_number=payload.work_number,
        date=payload.date,
        foreman=payload.foreman,
        site_manager=payload.site_manager,
        work_groups=payload.work_groups,
        machinery_groups=payload.machinery_groups,
        material_groups=payload.material_groups,
        subcontract_groups=payload.subcontract_groups,
        rental_machinery_groups=payload.rental_machinery_groups,
        total_amount=payload.total_amount,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return SavedEconomicReportRead.model_validate(report, from_attributes=True)


def delete_saved_economic_report(
    session: Session,
    *,
    tenant_id: int,
    report_id: int,
) -> bool:
    stmt = (
        select(SavedEconomicReport)
        .where(
            SavedEconomicReport.tenant_id == tenant_id,
            SavedEconomicReport.id == report_id,
        )
    )
    report = session.exec(stmt).first()
    if not report:
        return False
    session.delete(report)
    session.commit()
    return True
