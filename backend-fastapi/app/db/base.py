"""
Punto central donde se importan todos los modelos SQLModel.

Esto permite que `SQLModel.metadata.create_all()` conozca todas las tablas.
"""

from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.role import Role  # noqa: F401
from app.models.permission import Permission  # noqa: F401
from app.models.role_permission import RolePermission  # noqa: F401
from app.models.tool import Tool  # noqa: F401
from app.models.tenant_tool import TenantTool  # noqa: F401
from app.models.tenant_branding import TenantBranding  # noqa: F401
from app.models.tenant_profile import TenantProfile  # noqa: F401
from app.models.job_run_lock import JobRunLock  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.mfa_email_code import MFAEmailCode  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.ticket_message import TicketMessage  # noqa: F401
from app.models.ticket_participant import TicketParticipant  # noqa: F401
from app.models.hr import (  # noqa: F401
    Department,
    EmployeeProfile,
    EmployeeDepartment,
    EmployeeAllocation,
)  # noqa: F401
from app.models.user_invitation import UserInvitation  # noqa: F401
from app.models.user_preference import UserPreference  # noqa: F401
from app.models.erp import (  # noqa: F401
    Activity,
    Deliverable,
    Milestone,
    Project,
    ProjectBudgetLine,
    ProjectBudgetMilestone,
    BudgetLineMilestone,
    ExternalCollaboration,
    SimulationProject,
    SimulationExpense,
    SubActivity,
    Task,
    TaskTemplate,
    TimeEntry,
    TimeSession,
    ProjectDocument,
)
from app.models.summary import SummaryYear  # noqa: F401
from app.models.inventory import (  # noqa: F401
    WorkInventoryItem,
    InventoryMovement,
    WorkInventorySyncLog,
    PendingDeliveryNote,
)
from app.models.attachments import (  # noqa: F401
    WorkReportAttachment,
    SharedFile,
)
from app.models.message import Message  # noqa: F401
from app.models.custom_holiday import CustomHoliday  # noqa: F401
from app.models.rental_machinery_assignment import RentalMachineryAssignment  # noqa: F401
from app.models.work_report_comment import WorkReportComment  # noqa: F401
from app.models.phase import Phase  # noqa: F401
from app.models.user_app_role import UserAppRole  # noqa: F401
from app.models.user_work_assignment import UserWorkAssignment  # noqa: F401
from app.models.company_portfolio import CompanyPortfolio, CompanyType  # noqa: F401
from app.invoices.models import Invoice, InvoiceEvent, NotificationLog  # noqa: F401
from app.contracts.models import (  # noqa: F401
    Contract,
    ContractOffer,
    ContractApproval,
    ContractDocument,
    SignatureRequest,
    ContractEvent,
    ContractNotificationLog,
    Supplier,
    SupplierInvitation,
)
