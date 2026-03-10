from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from sqlmodel import Session

from app.api.deps import get_current_active_user, require_any_permissions, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.erp import (
    ActivityCreate,
    ActivityRead,
    ActivityUpdate,
    AccessControlReportCreate,
    AccessControlReportRead,
    AccessControlReportUpdate,
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
    ProjectDocumentRead,
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
    WorkReportCreate,
    WorkReportRead,
    WorkReportSyncRequest,
    WorkReportSyncResponse,
    WorkReportUpdate,
    RentalMachineryCreate,
    RentalMachineryRead,
    RentalMachineryUpdate,
)
from app.services.erp_service import (
    create_activity,
    create_access_control_report,
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
    delete_access_control_report,
    delete_task,
    delete_time_session,
    delete_project_budget_line,
    delete_project_budget_milestone,
    get_active_time_session,
    get_project,
    get_time_report,
    list_activities,
    list_access_control_reports,
    list_deliverables,
    list_milestones,
    list_projects,
    list_project_budget_lines,
    list_project_budget_milestones,
    list_subactivities,
    list_tasks,
    list_task_templates,
    list_time_sessions,
    list_work_reports,
    get_work_report,
    get_access_control_report,
    create_work_report,
    hard_delete_work_report,
    update_work_report,
    update_access_control_report,
    sync_work_reports,
    list_rental_machinery,
    create_rental_machinery,
    update_rental_machinery,
    delete_rental_machinery,
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
from app.services.project_document_service import (
    create_project_document,
    list_project_documents,
)


router = APIRouter()

# Funcion permisos lectura 
def _tenant_for_read(current_user: User, x_tenant_id: Optional[int]) -> Optional[int]:
    # Si el usuario es superadmin : lee cualquier datos de cualquier tenant
    if current_user.is_super_admin:
        return x_tenant_id
    # si no superadmin y no tiene tenant asigando --> Error de persimos de lectura
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
        #Usuario normal --> solo lectura de su tenant 
    return current_user.tenant_id

 # Funcion permisos escribir por tenant
def _tenant_for_write(
    current_user: User,
    x_tenant_id: Optional[int],
    require_header: bool = False,
) -> Optional[int]:
    # SuperAdmin --> puede escribir en cualquier tenant
    if current_user.is_super_admin:
        # Si envia el X-TenantID usa ese tenant para escribir
        if x_tenant_id is not None:
            return x_tenant_id
        if current_user.tenant_id is not None:
            return current_user.tenant_id
         # Si se exige cabecera y no se ha enviado X-Tenant-Id --> lanza error
        if require_header:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-Id requerido para escribir.",
            )
            # Puede devolver None en casos especiales como superadmin
        return None
    #Usuario normal --> Tiene que tener un tenant asociado para poder escribit
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
        #solo escribir en su propio tenant
    return current_user.tenant_id


def _require_tenant_scope(
    current_user: User,
    x_tenant_id: Optional[int],
    *,
    for_write: bool,
) -> int:
    tenant_id = (
        _tenant_for_write(current_user, x_tenant_id, require_header=True)
        if for_write
        else _tenant_for_read(current_user, x_tenant_id)
    )
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-Id requerido.",
        )
    return tenant_id


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
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "no encontrado" in detail.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc


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


@router.get("/projects/{project_id}/documents", response_model=list[ProjectDocumentRead])
def api_list_project_documents(
    project_id: int,
    doc_type: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ProjectDocumentRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    documents = list_project_documents(session, project_id, tenant_id, doc_type)
    return [
        ProjectDocumentRead(
            id=doc.id,
            tenant_id=doc.tenant_id,
            project_id=doc.project_id,
            doc_type=doc.doc_type,
            original_name=doc.original_name,
            content_type=doc.content_type,
            size_bytes=doc.size_bytes,
            uploaded_at=doc.uploaded_at,
            url=f"/static/project-docs/{doc.file_name}",
        )
        for doc in documents
    ]


@router.post(
    "/projects/{project_id}/documents",
    response_model=ProjectDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def api_upload_project_document(
    project_id: int,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> ProjectDocumentRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        doc = create_project_document(session, project_id, file, tenant_id, doc_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ProjectDocumentRead(
        id=doc.id,
        tenant_id=doc.tenant_id,
        project_id=doc.project_id,
        doc_type=doc.doc_type,
        original_name=doc.original_name,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        uploaded_at=doc.uploaded_at,
        url=f"/static/project-docs/{doc.file_name}",
    )


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
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Optional[TimeSessionRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return get_active_time_session(session, current_user, tenant_id)


@router.post("/time-tracking/start", response_model=TimeSessionRead, status_code=status.HTTP_201_CREATED)
def api_start_time_session(
    data: TimeTrackingStart,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> TimeSessionRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return start_time_session(
            session,
            current_user,
            data.task_id,
            tenant_id,
            payload_tenant_id=data.tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/time-tracking/stop", response_model=TimeSessionRead)
def api_stop_time_session(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
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
    current_user: User = Depends(require_permissions(["erp:reports:read"])),
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


def _map_work_report_error(detail: str) -> int:
    lower = detail.lower()
    if "no encontrado" in lower:
        return status.HTTP_404_NOT_FOUND
    if "cerrado" in lower or "concurrencia" in lower or "ya existe" in lower:
        return status.HTTP_409_CONFLICT
    return status.HTTP_400_BAD_REQUEST


def _map_access_control_error(detail: str) -> int:
    lower = detail.lower()
    if "no encontrado" in lower:
        return status.HTTP_404_NOT_FOUND
    if "concurrencia" in lower:
        return status.HTTP_409_CONFLICT
    return status.HTTP_400_BAD_REQUEST


@router.get("/work-reports", response_model=list[WorkReportRead])
def api_list_work_reports(
    project_id: Optional[int] = Query(default=None),
    external_id: Optional[str] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    updated_since: Optional[datetime] = Query(default=None),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[WorkReportRead]:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=False)
        return list_work_reports(
            session,
            tenant_id,
            project_id=project_id,
            external_id=external_id,
            date_from=date_from,
            date_to=date_to,
            status=status_filter,
            updated_since=updated_since,
            include_deleted=include_deleted,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/work-reports/{report_id}", response_model=WorkReportRead)
def api_get_work_report(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> WorkReportRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=False)
        return get_work_report(session, report_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=_map_work_report_error(str(exc)), detail=str(exc)) from exc


@router.post("/work-reports", response_model=WorkReportRead, status_code=status.HTTP_201_CREATED)
def api_create_work_report(
    payload: WorkReportCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> WorkReportRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return create_work_report(
            session,
            payload,
            tenant_id,
            current_user_id=current_user.id,
            idempotency_key=idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_work_report_error(str(exc)), detail=str(exc)) from exc


@router.patch("/work-reports/{report_id}", response_model=WorkReportRead)
def api_update_work_report(
    report_id: int,
    payload: WorkReportUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> WorkReportRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return update_work_report(
            session,
            report_id,
            payload,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_work_report_error(str(exc)), detail=str(exc)) from exc


@router.delete("/work-reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_work_report(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        hard_delete_work_report(
            session,
            report_id,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_work_report_error(str(exc)), detail=str(exc)) from exc


@router.post("/work-reports/sync", response_model=WorkReportSyncResponse)
def api_sync_work_reports(
    payload: WorkReportSyncRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> WorkReportSyncResponse:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return sync_work_reports(
            session,
            tenant_id,
            payload,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_work_report_error(str(exc)), detail=str(exc)) from exc


@router.get("/access-control-reports", response_model=list[AccessControlReportRead])
def api_list_access_control_reports(
    project_id: Optional[int] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    updated_since: Optional[datetime] = Query(default=None),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[AccessControlReportRead]:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=False)
        return list_access_control_reports(
            session,
            tenant_id,
            project_id=project_id,
            date_from=date_from,
            date_to=date_to,
            updated_since=updated_since,
            include_deleted=include_deleted,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_access_control_error(str(exc)), detail=str(exc)) from exc


@router.get("/access-control-reports/{report_id}", response_model=AccessControlReportRead)
def api_get_access_control_report(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> AccessControlReportRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=False)
        return get_access_control_report(session, report_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=_map_access_control_error(str(exc)), detail=str(exc)) from exc


@router.post("/access-control-reports", response_model=AccessControlReportRead, status_code=status.HTTP_201_CREATED)
def api_create_access_control_report(
    payload: AccessControlReportCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> AccessControlReportRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return create_access_control_report(
            session,
            payload,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_access_control_error(str(exc)), detail=str(exc)) from exc


@router.patch("/access-control-reports/{report_id}", response_model=AccessControlReportRead)
def api_update_access_control_report(
    report_id: int,
    payload: AccessControlReportUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:manage", "erp:track"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> AccessControlReportRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return update_access_control_report(
            session,
            report_id,
            payload,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_access_control_error(str(exc)), detail=str(exc)) from exc


@router.delete("/access-control-reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_access_control_report(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        delete_access_control_report(
            session,
            report_id,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=_map_access_control_error(str(exc)), detail=str(exc)) from exc


@router.get("/rental-machinery", response_model=list[RentalMachineryRead])
def api_list_rental_machinery(
    project_id: Optional[int] = Query(default=None),
    active_on: Optional[date] = Query(default=None),
    date_filter: Optional[date] = Query(default=None, alias="date"),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:read"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[RentalMachineryRead]:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=False)
        effective_active_on = active_on or date_filter
        return list_rental_machinery(
            session,
            tenant_id,
            project_id=project_id,
            active_on=effective_active_on,
            status=status_filter,
            include_deleted=include_deleted,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/rental-machinery", response_model=RentalMachineryRead, status_code=status.HTTP_201_CREATED)
def api_create_rental_machinery(
    payload: RentalMachineryCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> RentalMachineryRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return create_rental_machinery(
            session,
            payload,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/rental-machinery/{machinery_id}", response_model=RentalMachineryRead)
def api_update_rental_machinery(
    machinery_id: int,
    payload: RentalMachineryUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> RentalMachineryRead:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        return update_rental_machinery(
            session,
            machinery_id,
            payload,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "no encontrada" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.delete("/rental-machinery/{machinery_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_rental_machinery(
    machinery_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _require_tenant_scope(current_user, x_tenant_id, for_write=True)
        delete_rental_machinery(
            session,
            machinery_id,
            tenant_id,
            current_user_id=current_user.id,
        )
    except ValueError as exc:
        code = status.HTTP_404_NOT_FOUND if "no encontrada" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc
