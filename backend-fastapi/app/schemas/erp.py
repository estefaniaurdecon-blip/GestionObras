from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

DateType = date


class ProjectRead(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    project_type: Optional[str] = None
    department_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    duration_months: Optional[int] = None
    loan_percent: Optional[float] = None
    subsidy_percent: Optional[float] = None
    is_active: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_type: Optional[str] = None
    department_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    loan_percent: Optional[float] = None
    subsidy_percent: Optional[float] = None
    is_active: bool = True


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    department_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    loan_percent: Optional[float] = None
    subsidy_percent: Optional[float] = None
    is_active: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class TaskRead(BaseModel):
    id: int
    project_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    task_template_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str
    is_completed: bool
    created_at: datetime


class TaskCreate(BaseModel):
    project_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    task_template_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    is_completed: bool = False


class TaskUpdate(BaseModel):
    project_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    task_template_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    is_completed: Optional[bool] = None


class TaskTemplateRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime


class TaskTemplateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    is_active: bool = True


class ActivityRead(BaseModel):
    id: int
    project_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime


class ActivityCreate(BaseModel):
    project_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_to_id: Optional[int] = None


class SubActivityRead(BaseModel):
    id: int
    activity_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime


class SubActivityCreate(BaseModel):
    activity_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class SubActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_to_id: Optional[int] = None


class MilestoneRead(BaseModel):
    id: int
    project_id: int
    activity_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: bool
    created_at: datetime


class MilestoneCreate(BaseModel):
    project_id: int
    activity_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: bool = False


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: Optional[bool] = None


class DeliverableRead(BaseModel):
    id: int
    milestone_id: int
    title: str
    notes: Optional[str] = None
    link_url: Optional[str] = None
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    is_late: bool
    created_at: datetime


class DeliverableCreate(BaseModel):
    milestone_id: int
    title: str
    notes: Optional[str] = None
    link_url: Optional[str] = None
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None


class DeliverableUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    link_url: Optional[str] = None
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None


class TimeSessionRead(BaseModel):
    id: int
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    user_id: int
    description: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int
    is_active: bool
    created_at: datetime


class TimeTrackingStart(BaseModel):
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    tenant_id: Optional[int] = None


class TimeSessionCreate(BaseModel):
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    description: Optional[str] = None
    started_at: datetime
    ended_at: datetime


class TimeSessionUpdate(BaseModel):
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    description: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class TimeReportRow(BaseModel):
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    task_id: int
    task_title: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    total_hours: Decimal
    hourly_rate: Optional[Decimal] = None


class BudgetLineMilestoneBase(BaseModel):
    milestone_id: int
    amount: Decimal
    justified: Decimal


class BudgetLineMilestoneCreate(BudgetLineMilestoneBase):
    pass


class BudgetLineMilestoneRead(BudgetLineMilestoneBase):
    id: int
    created_at: datetime


class ProjectBudgetMilestoneBase(BaseModel):
    name: str
    order_index: int = 0


class ProjectBudgetMilestoneCreate(ProjectBudgetMilestoneBase):
    pass


class ProjectBudgetMilestoneUpdate(BaseModel):
    name: Optional[str] = None
    order_index: Optional[int] = None


class ProjectBudgetMilestoneRead(ProjectBudgetMilestoneBase):
    id: int
    project_id: int
    created_at: datetime


class ProjectBudgetLineBase(BaseModel):
    concept: str
    hito1_budget: Decimal
    justified_hito1: Decimal
    hito2_budget: Decimal
    justified_hito2: Decimal
    approved_budget: Decimal
    percent_spent: Decimal
    forecasted_spent: Decimal
    milestones: Optional[list[BudgetLineMilestoneRead]] = None


class ProjectBudgetLineCreate(ProjectBudgetLineBase):
    milestones: Optional[list[BudgetLineMilestoneCreate]] = None


class ProjectBudgetLineUpdate(BaseModel):
    concept: Optional[str] = None
    hito1_budget: Optional[Decimal] = None
    justified_hito1: Optional[Decimal] = None
    hito2_budget: Optional[Decimal] = None
    justified_hito2: Optional[Decimal] = None
    approved_budget: Optional[Decimal] = None
    percent_spent: Optional[Decimal] = None
    forecasted_spent: Optional[Decimal] = None
    milestones: Optional[list[BudgetLineMilestoneCreate]] = None


class ProjectBudgetLineRead(ProjectBudgetLineBase):
    id: int
    project_id: int
    created_at: datetime


class ExternalCollaborationBase(BaseModel):
    collaboration_type: str
    name: str
    legal_name: str
    cif: str
    contact_email: EmailStr


class ExternalCollaborationCreate(ExternalCollaborationBase):
    pass


class ExternalCollaborationUpdate(BaseModel):
    collaboration_type: Optional[str] = None
    name: Optional[str] = None
    legal_name: Optional[str] = None
    cif: Optional[str] = None
    contact_email: Optional[EmailStr] = None


class ExternalCollaborationRead(BaseModel):
    id: int
    collaboration_type: str
    name: str
    legal_name: str
    cif: str
    contact_email: str
    created_at: datetime
    updated_at: datetime


class ProjectDocumentRead(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    project_id: int
    doc_type: str
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime
    url: str


WorkReportStatus = Literal[
    "draft",
    "pending",
    "approved",
    "completed",
    "missing_data",
    "missing_delivery_notes",
    "closed",
    "archived",
]
WorkReportSyncOperationType = Literal["create", "update", "delete"]


class WorkReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    project_id: int
    external_id: Optional[str] = None
    report_identifier: Optional[str] = None
    idempotency_key: Optional[str] = None
    title: Optional[str] = None
    date: date
    status: WorkReportStatus
    is_closed: bool
    payload: dict[str, Any] = Field(default_factory=dict)
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    creator_group_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class WorkReportCreate(BaseModel):
    project_id: int
    date: date
    title: Optional[str] = None
    status: WorkReportStatus = "draft"
    is_closed: bool = False
    report_identifier: Optional[str] = None
    external_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class WorkReportUpdate(BaseModel):
    project_id: Optional[int] = None
    date: Optional[DateType] = None
    title: Optional[str] = None
    status: Optional[WorkReportStatus] = None
    is_closed: Optional[bool] = None
    report_identifier: Optional[str] = None
    external_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    expected_updated_at: Optional[datetime] = None


class WorkReportSyncOperation(BaseModel):
    client_op_id: str
    op: WorkReportSyncOperationType
    report_id: Optional[int] = None
    external_id: Optional[str] = None
    client_temp_id: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)


class WorkReportSyncRequest(BaseModel):
    operations: list[WorkReportSyncOperation] = Field(default_factory=list)
    since: Optional[datetime] = None
    include_deleted: bool = True
    limit: int = Field(default=100, ge=1, le=500)


class WorkReportSyncAck(BaseModel):
    client_op_id: str
    op: WorkReportSyncOperationType
    ok: bool
    report_id: Optional[int] = None
    external_id: Optional[str] = None
    client_temp_id: Optional[str] = None
    mapped_server_id: Optional[int] = None
    server_updated_at: Optional[datetime] = None
    error: Optional[str] = None


class WorkReportSyncResponse(BaseModel):
    ack: list[WorkReportSyncAck] = Field(default_factory=list)
    id_map: dict[str, int] = Field(default_factory=dict)
    server_changes: list[WorkReportRead] = Field(default_factory=list)


class AccessControlReportRead(BaseModel):
    id: int
    tenant_id: int
    project_id: Optional[int] = None
    external_id: Optional[str] = None
    date: date
    site_name: str
    responsible: str
    responsible_entry_time: Optional[str] = None
    responsible_exit_time: Optional[str] = None
    observations: str = ""
    personal_entries: list[dict[str, Any]] = Field(default_factory=list)
    machinery_entries: list[dict[str, Any]] = Field(default_factory=list)
    additional_tasks: Optional[str] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class AccessControlReportCreate(BaseModel):
    date: date
    site_name: str
    responsible: str
    project_id: Optional[int] = None
    external_id: Optional[str] = None
    responsible_entry_time: Optional[str] = None
    responsible_exit_time: Optional[str] = None
    observations: str = ""
    personal_entries: list[dict[str, Any]] = Field(default_factory=list)
    machinery_entries: list[dict[str, Any]] = Field(default_factory=list)
    additional_tasks: Optional[str] = None


class AccessControlReportUpdate(BaseModel):
    date: Optional[DateType] = None
    site_name: Optional[str] = None
    responsible: Optional[str] = None
    project_id: Optional[int] = None
    external_id: Optional[str] = None
    responsible_entry_time: Optional[str] = None
    responsible_exit_time: Optional[str] = None
    observations: Optional[str] = None
    personal_entries: Optional[list[dict[str, Any]]] = None
    machinery_entries: Optional[list[dict[str, Any]]] = None
    additional_tasks: Optional[str] = None
    expected_updated_at: Optional[datetime] = None


RentalMachineryStatus = Literal["active", "inactive", "archived"]
RentalMachineryPriceUnit = Literal["day", "hour", "month"]


class RentalMachineryRead(BaseModel):
    id: int
    tenant_id: int
    project_id: int
    is_rental: bool
    name: str
    machine_number: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None
    provider: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    price: Optional[Decimal] = None
    price_unit: str
    status: str
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class RentalMachineryCreate(BaseModel):
    project_id: int
    is_rental: bool = True
    name: str
    machine_number: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None
    provider: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    price: Optional[Decimal] = None
    price_unit: RentalMachineryPriceUnit = "day"
    status: RentalMachineryStatus = "active"


class RentalMachineryUpdate(BaseModel):
    project_id: Optional[int] = None
    is_rental: Optional[bool] = None
    name: Optional[str] = None
    machine_number: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None
    provider: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    price: Optional[Decimal] = None
    price_unit: Optional[RentalMachineryPriceUnit] = None
    status: Optional[RentalMachineryStatus] = None


WorkServiceStatus = Literal["pending", "in_progress", "completed"]


class WorkRepasoRead(BaseModel):
    id: int
    tenant_id: int
    project_id: int
    external_id: Optional[str] = None
    code: str
    status: WorkServiceStatus
    description: str
    assigned_company: Optional[str] = None
    estimated_hours: Decimal = Field(default=0)
    actual_hours: Decimal = Field(default=0)
    before_image: Optional[str] = None
    after_image: Optional[str] = None
    subcontract_groups: list[Any] = Field(default_factory=list)
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class WorkRepasoCreate(BaseModel):
    project_id: int
    external_id: Optional[str] = None
    status: WorkServiceStatus = "pending"
    description: str
    assigned_company: Optional[str] = None
    estimated_hours: Decimal = Field(default=0)
    actual_hours: Decimal = Field(default=0)
    before_image: Optional[str] = None
    after_image: Optional[str] = None
    subcontract_groups: list[Any] = Field(default_factory=list)


class WorkRepasoUpdate(BaseModel):
    project_id: Optional[int] = None
    status: Optional[WorkServiceStatus] = None
    description: Optional[str] = None
    assigned_company: Optional[str] = None
    estimated_hours: Optional[Decimal] = None
    actual_hours: Optional[Decimal] = None
    before_image: Optional[str] = None
    after_image: Optional[str] = None
    subcontract_groups: Optional[list[Any]] = None


class WorkPostventaRead(BaseModel):
    id: int
    tenant_id: int
    project_id: int
    external_id: Optional[str] = None
    code: str
    status: WorkServiceStatus
    description: str
    assigned_company: Optional[str] = None
    estimated_hours: Decimal = Field(default=0)
    actual_hours: Decimal = Field(default=0)
    before_image: Optional[str] = None
    after_image: Optional[str] = None
    subcontract_groups: list[Any] = Field(default_factory=list)
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class WorkPostventaCreate(BaseModel):
    project_id: int
    external_id: Optional[str] = None
    status: WorkServiceStatus = "pending"
    description: str
    assigned_company: Optional[str] = None
    estimated_hours: Decimal = Field(default=0)
    actual_hours: Decimal = Field(default=0)
    before_image: Optional[str] = None
    after_image: Optional[str] = None
    subcontract_groups: list[Any] = Field(default_factory=list)


class WorkPostventaUpdate(BaseModel):
    project_id: Optional[int] = None
    status: Optional[WorkServiceStatus] = None
    description: Optional[str] = None
    assigned_company: Optional[str] = None
    estimated_hours: Optional[Decimal] = None
    actual_hours: Optional[Decimal] = None
    before_image: Optional[str] = None
    after_image: Optional[str] = None
    subcontract_groups: Optional[list[Any]] = None
