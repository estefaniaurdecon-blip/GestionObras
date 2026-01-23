from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.erp import (
    ActivityCreate,
    ActivityRead,
    ActivityUpdate,
    BudgetLineMilestoneCreate,
    BudgetLineMilestoneRead,
    DeliverableCreate,
    DeliverableRead,
    DeliverableUpdate,
    MilestoneCreate,
    MilestoneRead,
    MilestoneUpdate,
    ProjectBudgetLineCreate,
    ProjectBudgetLineRead,
    ProjectBudgetLineUpdate,
    ProjectBudgetMilestoneCreate,
    ProjectBudgetMilestoneRead,
    ProjectBudgetMilestoneUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    SubActivityCreate,
    SubActivityRead,
    SubActivityUpdate,
    TaskCreate,
    TaskRead,
    TaskTemplateCreate,
    TaskTemplateRead,
    TaskUpdate,
    TimeReportRow,
    TimeSessionCreate,
    TimeSessionRead,
    TimeSessionUpdate,
    TimeTrackingStart,
)
from app.services.erp_service import (
    create_activity,
    create_deliverable,
    create_milestone,
    create_project,
    create_project_budget_line,
    create_project_budget_milestone,
    create_subactivity,
    create_task,
    create_task_template,
    create_manual_time_session,
    delete_project,
    delete_task,
    delete_time_session,
    delete_project_budget_line,
    delete_project_budget_milestone,
    get_active_time_session,
    get_project,
    get_time_report,
    list_activities,
    list_deliverables,
    list_milestones,
    list_projects,
    list_project_budget_lines,
    list_project_budget_milestones,
    list_subactivities,
    list_tasks,
    list_task_templates,
    list_time_sessions,
    start_time_session,
    stop_time_session,
    update_activity,
    update_task,
    update_deliverable,
    update_milestone,
    update_project,
    update_project_budget_milestone,
    update_subactivity,
    update_time_session,
    update_project_budget_line,
)


router = APIRouter()


@router.get("/projects", response_model=list[ProjectRead])
def api_list_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[ProjectRead]:
    return list_projects(session)


@router.get("/projects/{project_id}", response_model=ProjectRead)
def api_get_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> ProjectRead:
    try:
        return get_project(session, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def api_create_project(
    payload: ProjectCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectRead:
    return create_project(session, payload)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def api_update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectRead:
    try:
        return update_project(session, project_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> None:
    try:
        delete_project(session, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/projects/{project_id}/budgets", response_model=list[ProjectBudgetLineRead])
def api_list_project_budgets(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[ProjectBudgetLineRead]:
    try:
        get_project(session, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    lines, milestones_by_line = list_project_budget_lines(session, project_id)
    result: list[ProjectBudgetLineRead] = []
    for line in lines:
        milestones = milestones_by_line.get(line.id, [])
        result.append(
          ProjectBudgetLineRead(
            id=line.id,
            project_id=line.project_id,
            concept=line.concept,
            hito1_budget=line.hito1_budget,
            justified_hito1=line.justified_hito1,
            hito2_budget=line.hito2_budget,
            justified_hito2=line.justified_hito2,
            approved_budget=line.approved_budget,
            percent_spent=line.percent_spent,
            forecasted_spent=line.forecasted_spent,
            created_at=line.created_at,
            milestones=[
              BudgetLineMilestoneRead(
                id=m.id,
                milestone_id=m.milestone_id,
                amount=m.amount,
                justified=m.justified,
                created_at=m.created_at,
              )
              for m in milestones
            ],
          )
        )
    return result


@router.get("/projects/{project_id}/budget-milestones", response_model=list[ProjectBudgetMilestoneRead])
def api_list_project_budget_milestones(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[ProjectBudgetMilestoneRead]:
    try:
        get_project(session, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return list_project_budget_milestones(session, project_id)


@router.post(
    "/projects/{project_id}/budget-milestones",
    response_model=ProjectBudgetMilestoneRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_project_budget_milestone(
    project_id: int,
    payload: ProjectBudgetMilestoneCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectBudgetMilestoneRead:
    try:
        return create_project_budget_milestone(session, project_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch(
    "/projects/{project_id}/budget-milestones/{milestone_id}",
    response_model=ProjectBudgetMilestoneRead,
)
def api_update_project_budget_milestone(
    project_id: int,
    milestone_id: int,
    payload: ProjectBudgetMilestoneUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectBudgetMilestoneRead:
    try:
        return update_project_budget_milestone(session, project_id, milestone_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/projects/{project_id}/budget-milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project_budget_milestone(
    project_id: int,
    milestone_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> None:
    try:
        delete_project_budget_milestone(session, project_id, milestone_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/projects/{project_id}/budgets",
    response_model=ProjectBudgetLineRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_project_budget_line(
    project_id: int,
    payload: ProjectBudgetLineCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectBudgetLineRead:
    try:
        get_project(session, project_id)
        line = create_project_budget_line(session, project_id, payload)
        milestones = getattr(line, "milestones", [])
        return ProjectBudgetLineRead(
            id=line.id,
            project_id=line.project_id,
            concept=line.concept,
            hito1_budget=line.hito1_budget,
            justified_hito1=line.justified_hito1,
            hito2_budget=line.hito2_budget,
            justified_hito2=line.justified_hito2,
            approved_budget=line.approved_budget,
            percent_spent=line.percent_spent,
            forecasted_spent=line.forecasted_spent,
            created_at=line.created_at,
            milestones=[
                BudgetLineMilestoneRead(
                    id=m.id,
                    milestone_id=m.milestone_id,
                    amount=m.amount,
                    justified=m.justified,
                    created_at=m.created_at,
                )
                for m in milestones
            ],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/projects/{project_id}/budgets/{budget_id}", response_model=ProjectBudgetLineRead)
def api_update_project_budget_line(
    project_id: int,
    budget_id: int,
    payload: ProjectBudgetLineUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ProjectBudgetLineRead:
    try:
        line = update_project_budget_line(session, project_id, budget_id, payload)
        milestones = getattr(line, "milestones", [])
        return ProjectBudgetLineRead(
            id=line.id,
            project_id=line.project_id,
            concept=line.concept,
            hito1_budget=line.hito1_budget,
            justified_hito1=line.justified_hito1,
            hito2_budget=line.hito2_budget,
            justified_hito2=line.justified_hito2,
            approved_budget=line.approved_budget,
            percent_spent=line.percent_spent,
            forecasted_spent=line.forecasted_spent,
            created_at=line.created_at,
            milestones=[
                BudgetLineMilestoneRead(
                    id=m.id,
                    milestone_id=m.milestone_id,
                    amount=m.amount,
                    justified=m.justified,
                    created_at=m.created_at,
                )
                for m in milestones
            ],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/projects/{project_id}/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project_budget_line(
    project_id: int,
    budget_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> None:
    try:
        delete_project_budget_line(session, project_id, budget_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


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
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
) -> TaskRead:
    try:
        return create_task(session, current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/task-templates", response_model=list[TaskTemplateRead])
def api_list_task_templates(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[TaskTemplateRead]:
    return list_task_templates(session)


@router.post("/task-templates", response_model=TaskTemplateRead, status_code=status.HTTP_201_CREATED)
def api_create_task_template(
    payload: TaskTemplateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> TaskTemplateRead:
    return create_task_template(session, payload)


@router.get("/activities", response_model=list[ActivityRead])
def api_list_activities(
    project_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[ActivityRead]:
    return list_activities(session, project_id=project_id)


@router.post("/activities", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def api_create_activity(
    payload: ActivityCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ActivityRead:
    try:
        return create_activity(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/activities/{activity_id}", response_model=ActivityRead)
def api_update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> ActivityRead:
    try:
        return update_activity(session, activity_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/subactivities", response_model=list[SubActivityRead])
def api_list_subactivities(
    project_id: Optional[int] = Query(default=None),
    activity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[SubActivityRead]:
    return list_subactivities(session, project_id=project_id, activity_id=activity_id)


@router.post("/subactivities", response_model=SubActivityRead, status_code=status.HTTP_201_CREATED)
def api_create_subactivity(
    payload: SubActivityCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> SubActivityRead:
    try:
        return create_subactivity(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/subactivities/{subactivity_id}", response_model=SubActivityRead)
def api_update_subactivity(
    subactivity_id: int,
    payload: SubActivityUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> SubActivityRead:
    try:
        return update_subactivity(session, subactivity_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/milestones", response_model=list[MilestoneRead])
def api_list_milestones(
    project_id: Optional[int] = Query(default=None),
    activity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[MilestoneRead]:
    return list_milestones(session, project_id=project_id, activity_id=activity_id)


@router.post("/milestones", response_model=MilestoneRead, status_code=status.HTTP_201_CREATED)
def api_create_milestone(
    payload: MilestoneCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> MilestoneRead:
    try:
        return create_milestone(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/milestones/{milestone_id}", response_model=MilestoneRead)
def api_update_milestone(
    milestone_id: int,
    payload: MilestoneUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> MilestoneRead:
    try:
        return update_milestone(session, milestone_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/deliverables", response_model=list[DeliverableRead])
def api_list_deliverables(
    milestone_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
) -> list[DeliverableRead]:
    return list_deliverables(session, milestone_id=milestone_id)


@router.post("/deliverables", response_model=DeliverableRead, status_code=status.HTTP_201_CREATED)
def api_create_deliverable(
    payload: DeliverableCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> DeliverableRead:
    try:
        return create_deliverable(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/deliverables/{deliverable_id}", response_model=DeliverableRead)
def api_update_deliverable(
    deliverable_id: int,
    payload: DeliverableUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> DeliverableRead:
    try:
        return update_deliverable(session, deliverable_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/tasks/{task_id}", response_model=TaskRead)
def api_update_task(
    task_id: int,
    payload: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
) -> TaskRead:
    try:
        return update_task(session, current_user, task_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
) -> None:
    try:
        delete_task(session, task_id)
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
