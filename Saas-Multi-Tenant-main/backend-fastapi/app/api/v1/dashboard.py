from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import get_dashboard_summary


router = APIRouter()


@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Resumen de métricas para el dashboard",
)
def dashboard_summary(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> DashboardSummary:
    """
    Devuelve las métricas principales para el dashboard.
    """

    return get_dashboard_summary(session=session, current_user=current_user)


