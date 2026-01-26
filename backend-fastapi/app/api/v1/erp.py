from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
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


def _tenant_for_read(current_user: User, x_tenant_id: Optional[int]) -> Optional[int]:
    if current_user.is_super_admin:
        return x_tenant_id
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
    return current_user.tenant_id


def _tenant_for_write(current_user: User, x_tenant_id: Optional[int]) -> int:
    if current_user.is_super_admin:
        if x_tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-Id requerido para escribir.",
            )
        return x_tenant_id
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
    return current_user.tenant_id


@router.get("/projects", response_model=list[ProjectRead])
def api_list_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ProjectRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_projects(session, tenant_id)


@router.get("/projects/{project_id}", response_model=ProjectRead)
def api_get_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectRead:
    try:
        tenant_id = _tenant_for_read(current_user, x_tenant_id)
        return get_project(session, project_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def api_create_project(
    payload: ProjectCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    return create_project(session, payload, tenant_id)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def api_update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_project(session, project_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        delete_project(session, project_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/projects/{project_id}/budgets", response_model=list[ProjectBudgetLineRead])
def api_list_project_budgets(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ProjectBudgetLineRead]:
    try:
        tenant_id = _tenant_for_read(current_user, x_tenant_id)
        get_project(session, project_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    lines, milestones_by_line = list_project_budget_lines(session, project_id, tenant_id)
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ProjectBudgetMilestoneRead]:
    try:
        tenant_id = _tenant_for_read(current_user, x_tenant_id)
        get_project(session, project_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return list_project_budget_milestones(session, project_id, tenant_id)


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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectBudgetMilestoneRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_project_budget_milestone(session, project_id, payload, tenant_id)
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectBudgetMilestoneRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_project_budget_milestone(
            session, project_id, milestone_id, payload, tenant_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/projects/{project_id}/budget-milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project_budget_milestone(
    project_id: int,
    milestone_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        delete_project_budget_milestone(session, project_id, milestone_id, tenant_id)
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectBudgetLineRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        get_project(session, project_id, tenant_id)
        line = create_project_budget_line(session, project_id, payload, tenant_id)
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectBudgetLineRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        line = update_project_budget_line(session, project_id, budget_id, payload, tenant_id)
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        delete_project_budget_line(session, project_id, budget_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/tasks", response_model=list[TaskRead])
def api_list_tasks(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[TaskRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_tasks(session, tenant_id)


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def api_create_task(
    payload: TaskCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TaskRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_task(session, current_user, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/task-templates", response_model=list[TaskTemplateRead])
def api_list_task_templates(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[TaskTemplateRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_task_templates(session, tenant_id)


@router.post("/task-templates", response_model=TaskTemplateRead, status_code=status.HTTP_201_CREATED)
def api_create_task_template(
    payload: TaskTemplateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TaskTemplateRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    return create_task_template(session, payload, tenant_id)


@router.get("/activities", response_model=list[ActivityRead])
def api_list_activities(
    project_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ActivityRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_activities(session, tenant_id, project_id=project_id)


@router.post("/activities", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def api_create_activity(
    payload: ActivityCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ActivityRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_activity(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/activities/{activity_id}", response_model=ActivityRead)
def api_update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ActivityRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_activity(session, activity_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/subactivities", response_model=list[SubActivityRead])
def api_list_subactivities(
    project_id: Optional[int] = Query(default=None),
    activity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[SubActivityRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_subactivities(
        session, tenant_id, project_id=project_id, activity_id=activity_id
    )


@router.post("/subactivities", response_model=SubActivityRead, status_code=status.HTTP_201_CREATED)
def api_create_subactivity(
    payload: SubActivityCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> SubActivityRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_subactivity(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/subactivities/{subactivity_id}", response_model=SubActivityRead)
def api_update_subactivity(
    subactivity_id: int,
    payload: SubActivityUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> SubActivityRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_subactivity(session, subactivity_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/milestones", response_model=list[MilestoneRead])
def api_list_milestones(
    project_id: Optional[int] = Query(default=None),
    activity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[MilestoneRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_milestones(session, tenant_id, project_id=project_id, activity_id=activity_id)


@router.post("/milestones", response_model=MilestoneRead, status_code=status.HTTP_201_CREATED)
def api_create_milestone(
    payload: MilestoneCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> MilestoneRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_milestone(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/milestones/{milestone_id}", response_model=MilestoneRead)
def api_update_milestone(
    milestone_id: int,
    payload: MilestoneUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> MilestoneRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_milestone(session, milestone_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/deliverables", response_model=list[DeliverableRead])
def api_list_deliverables(
    milestone_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[DeliverableRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_deliverables(session, tenant_id, milestone_id=milestone_id)


@router.post("/deliverables", response_model=DeliverableRead, status_code=status.HTTP_201_CREATED)
def api_create_deliverable(
    payload: DeliverableCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> DeliverableRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_deliverable(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/deliverables/{deliverable_id}", response_model=DeliverableRead)
def api_update_deliverable(
    deliverable_id: int,
    payload: DeliverableUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> DeliverableRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_deliverable(session, deliverable_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/tasks/{task_id}", response_model=TaskRead)
def api_update_task(
    task_id: int,
    payload: TaskUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TaskRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_task(session, current_user, task_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_task(
    task_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        delete_task(session, task_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/time-tracking/active", response_model=Optional[TimeSessionRead])
def api_get_active_time_session(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Optional[TimeSessionRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return get_active_time_session(session, current_user, tenant_id)


@router.post("/time-tracking/start", response_model=TimeSessionRead, status_code=status.HTTP_201_CREATED)
def api_start_time_session(
    data: TimeTrackingStart,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TimeSessionRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return start_time_session(session, current_user, data.task_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/time-tracking/stop", response_model=TimeSessionRead)
def api_stop_time_session(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TimeSessionRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    session_obj = stop_time_session(session, current_user, tenant_id)
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[TimeReportRow]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    rows = get_time_report(
        session=session,
        tenant_id=tenant_id,
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
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[TimeSessionRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_time_sessions(
        session=session,
        user=current_user,
        tenant_id=tenant_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/time-sessions", response_model=TimeSessionRead, status_code=status.HTTP_201_CREATED)
def api_create_time_session(
    payload: TimeSessionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TimeSessionRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_manual_time_session(
            session=session,
            user=current_user,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/time-sessions/{session_id}", response_model=TimeSessionRead)
def api_update_time_session(
    session_id: int,
    payload: TimeSessionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TimeSessionRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_time_session(
            session=session,
            user=current_user,
            session_id=session_id,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/time-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_time_session(
    session_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        delete_time_session(
            session=session, user=current_user, session_id=session_id, tenant_id=tenant_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
