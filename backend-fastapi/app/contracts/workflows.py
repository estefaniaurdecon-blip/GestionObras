from __future__ import annotations

from typing import Iterable, Optional

from app.contracts.models import (
    ApprovalStatus,
    ContractApproval,
    ContractDepartment,
    ContractStatus,
)


PENDING_STATUS_BY_DEPARTMENT = {
    ContractDepartment.ADMIN: ContractStatus.PENDING_ADMIN,
    ContractDepartment.COMPRAS: ContractStatus.PENDING_COMPRAS,
    ContractDepartment.JURIDICO: ContractStatus.PENDING_JURIDICO,
}

APPROVAL_DEPARTMENT_ORDER = [
    ContractDepartment.ADMIN,
    ContractDepartment.COMPRAS,
    ContractDepartment.JURIDICO,
]


def next_pending_status(approvals: Iterable[ContractApproval]) -> Optional[ContractStatus]:
    pending = {
        approval.department
        for approval in approvals
        if approval.status == ApprovalStatus.PENDING
    }
    for dept in APPROVAL_DEPARTMENT_ORDER:
        if dept in pending:
            return PENDING_STATUS_BY_DEPARTMENT[dept]
    return None


def ensure_status(current: ContractStatus, allowed: Iterable[ContractStatus]) -> None:
    if current not in set(allowed):
        raise ValueError(f"Transicion invalida desde estado {current}")
