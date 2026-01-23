from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.db.session import get_session
from app.schemas.summary import SummaryYearlyData
from app.services.summary_service import (
    get_summary_by_year,
    upsert_summary_by_year,
)

router = APIRouter()


@router.get("/summary/{year}", response_model=SummaryYearlyData)
def read_summary(
    year: int,
    session: Session = Depends(get_session),
    current_user=Depends(require_any_permissions(["erp:read", "erp:track"])),
) -> SummaryYearlyData:
    return get_summary_by_year(session=session, year=year)


@router.put("/summary/{year}", response_model=SummaryYearlyData)
def update_summary(
    year: int,
    payload: SummaryYearlyData,
    session: Session = Depends(get_session),
    current_user=Depends(require_permissions(["erp:manage"])),
) -> SummaryYearlyData:
    return upsert_summary_by_year(session=session, year=year, payload=payload)
