from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.api.deps import require_permissions
from app.core.config import settings
from app.db.session import get_session
from app.models.notification import NotificationType
from app.models.user import User
from app.services.notification_service import create_notification
from app.workers.tasks.erp import auto_duplicate_rental_machinery_daily


router = APIRouter()


class InternalNotificationCreate(BaseModel):
    email: EmailStr
    title: str
    body: str
    reference: Optional[str] = None


class InternalAutoDuplicateRentalMachineryRequest(BaseModel):
    run_date: Optional[date] = None
    tenant_id: Optional[int] = None
    force: bool = False


class InternalJobScheduledResponse(BaseModel):
    scheduled: bool
    job_id: str
    task_name: str


@router.post("/notifications", status_code=status.HTTP_201_CREATED)
def api_create_notification(
    payload: InternalNotificationCreate,
    session: Session = Depends(get_session),
    api_key: Optional[str] = Header(default=None, alias="X-SAAS-API-KEY"),
) -> None:
    if not settings.saas_internal_api_key or api_key != settings.saas_internal_api_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    user = session.exec(select(User).where(User.email == payload.email)).one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no tenant",
        )

    create_notification(
        session=session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        type=NotificationType.GENERIC,
        title=payload.title,
        body=payload.body,
        reference=payload.reference,
    )


@router.post(
    "/jobs/auto-duplicate-rental-machinery",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=InternalJobScheduledResponse,
)
def api_schedule_auto_duplicate_rental_machinery(
    payload: InternalAutoDuplicateRentalMachineryRequest,
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> InternalJobScheduledResponse:
    task_result = auto_duplicate_rental_machinery_daily.apply_async(
        kwargs={
            "run_date": payload.run_date.isoformat() if payload.run_date else None,
            "tenant_id": payload.tenant_id,
            "force": payload.force,
            "requested_by_user_id": current_user.id,
        }
    )
    return InternalJobScheduledResponse(
        scheduled=True,
        job_id=task_result.id,
        task_name="auto_duplicate_rental_machinery_daily",
    )
