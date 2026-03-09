from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.custom_holiday import CustomHoliday
from app.models.user import User
from app.schemas.custom_holiday import (
    CustomHolidayCreate,
    CustomHolidayRead,
    CustomHolidayUpdate,
)


def _to_read(row: CustomHoliday) -> CustomHolidayRead:
    return CustomHolidayRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        date=row.date,
        name=row.name,
        region=row.region,
        created_by_id=row.created_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_custom_holidays(
    session: Session,
    *,
    tenant_id: int,
    region: Optional[str] = None,
) -> list[CustomHolidayRead]:
    stmt = (
        select(CustomHoliday)
        .where(CustomHoliday.tenant_id == tenant_id)
        .order_by(CustomHoliday.date.asc(), CustomHoliday.name.asc())
    )
    if region is not None:
        normalized = region.strip()
        if normalized == "":
            stmt = stmt.where(CustomHoliday.region.is_(None))
        else:
            stmt = stmt.where(CustomHoliday.region == normalized)

    rows = session.exec(stmt).all()
    return [_to_read(row) for row in rows]


def create_custom_holiday(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    payload: CustomHolidayCreate,
) -> CustomHolidayRead:
    row = CustomHoliday(
        tenant_id=tenant_id,
        date=payload.date,
        name=payload.name.strip(),
        region=(payload.region.strip() if payload.region else None),
        created_by_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


def update_custom_holiday(
    session: Session,
    *,
    tenant_id: int,
    holiday_id: int,
    payload: CustomHolidayUpdate,
) -> CustomHolidayRead:
    row = session.exec(
        select(CustomHoliday).where(
            CustomHoliday.id == holiday_id,
            CustomHoliday.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise ValueError("Festivo no encontrado.")

    if payload.date is not None:
        row.date = payload.date
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.region is not None:
        row.region = payload.region.strip() or None

    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


def delete_custom_holiday(
    session: Session,
    *,
    tenant_id: int,
    holiday_id: int,
) -> None:
    row = session.exec(
        select(CustomHoliday).where(
            CustomHoliday.id == holiday_id,
            CustomHoliday.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise ValueError("Festivo no encontrado.")

    session.delete(row)
    session.commit()
