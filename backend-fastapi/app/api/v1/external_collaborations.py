from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.erp import (
    ExternalCollaborationCreate,
    ExternalCollaborationRead,
    ExternalCollaborationUpdate,
)
from app.services.external_collaboration_service import (
    create_external_collaboration,
    delete_external_collaboration,
    list_external_collaborations,
    update_external_collaboration,
)


router = APIRouter()


@router.get("/external-collaborations", response_model=list[ExternalCollaborationRead])
def api_list_external_collaborations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ExternalCollaborationRead]:
    return list_external_collaborations(session)


@router.post(
    "/external-collaborations",
    response_model=ExternalCollaborationRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_external_collaboration(
    payload: ExternalCollaborationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ExternalCollaborationRead:
    try:
        return create_external_collaboration(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch(
    "/external-collaborations/{collaboration_id}",
    response_model=ExternalCollaborationRead,
)
def api_update_external_collaboration(
    collaboration_id: int,
    payload: ExternalCollaborationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ExternalCollaborationRead:
    try:
        return update_external_collaboration(session, collaboration_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/external-collaborations/{collaboration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def api_delete_external_collaboration(
    collaboration_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    try:
        delete_external_collaboration(session, collaboration_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
