from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.erp import (
    ProjectCreate,
    ProjectRead,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    TimeReportRow,
    TimeSessionCreate,
    TimeSessionRead,
    TimeSessionUpdate,
    TimeTrackingStart,
)
from app.services.erp_service import (
    create_project,
    create_task,
    create_manual_time_session,
    delete_time_session,
    get_active_time_session,
    get_time_report,
    list_projects,
    list_tasks,
    list_time_sessions,
    start_time_session,
    stop_time_session,
    update_task,
    update_time_session,
)


router = APIRouter()


@router.get("/projects", response_model=list[ProjectRead])
def api_list_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[ProjectRead]:
    return list_projects(session)


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def api_create_project(
    payload: ProjectCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectRead:
    return create_project(session, payload)


@router.get("/tasks", response_model=list[TaskRead])
def api_list_tasks(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[TaskRead]:
    return list_tasks(session)


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def api_create_task(
    payload: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> TaskRead:
    try:
        return create_task(session, current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/tasks/{task_id}", response_model=TaskRead)
def api_update_task(
    task_id: int,
    payload: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> TaskRead:
    try:
        return update_task(session, current_user, task_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/time-tracking/active", response_model=Optional[TimeSessionRead])
def api_get_active_time_session(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
) -> Optional[TimeSessionRead]:
    return get_active_time_session(session, current_user)


@router.post("/time-tracking/start", response_model=TimeSessionRead, status_code=status.HTTP_201_CREATED)
def api_start_time_session(
    data: TimeTrackingStart,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
) -> TimeSessionRead:
    try:
        return start_time_session(session, current_user, data.task_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/time-tracking/stop", response_model=TimeSessionRead)
def api_stop_time_session(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
) -> TimeSessionRead:
    session_obj = stop_time_session(session, current_user)
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay sesión activa.",
        )
    return session_obj


@router.get("/reports/time", response_model=list[TimeReportRow])
def api_time_report(
    project_id: Optional[int] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[TimeReportRow]:
    rows = get_time_report(
        session=session,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    return rows


@router.get("/time-sessions", response_model=list[TimeSessionRead])
def api_list_time_sessions(
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[TimeSessionRead]:
    return list_time_sessions(
        session=session,
        user=current_user,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/time-sessions", response_model=TimeSessionRead, status_code=status.HTTP_201_CREATED)
def api_create_time_session(
    payload: TimeSessionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
) -> TimeSessionRead:
    try:
        return create_manual_time_session(
            session=session,
            user=current_user,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/time-sessions/{session_id}", response_model=TimeSessionRead)
def api_update_time_session(
    session_id: int,
    payload: TimeSessionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
) -> TimeSessionRead:
    try:
        return update_time_session(
            session=session,
            user=current_user,
            session_id=session_id,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/time-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_time_session(
    session_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
) -> None:
    try:
        delete_time_session(session=session, user=current_user, session_id=session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
