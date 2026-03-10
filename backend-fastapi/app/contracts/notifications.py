from __future__ import annotations

from typing import Iterable, Optional

from sqlmodel import Session, select

from app.contracts.models import Contract, ContractNotificationEvent, ContractNotificationLog
from app.core.config import settings
from app.core.email import _send_email
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile
from app.models.user import User

_DEPT_NAMES = ["gerencia", "administracion", "compras", "juridico"]


def _merge_recipients(*groups: Iterable[str]) -> list[str]:
    merged: list[str] = []
    seen = set()
    for group in groups:
        for email in group:
            if not email:
                continue
            clean = email.strip().lower()
            if not clean or clean in seen:
                continue
            seen.add(clean)
            merged.append(clean)
    return merged


def _get_dept_emails(session: Session, tenant_id: int, dept_name: str) -> list[str]:
    rows = session.exec(
        select(User.email)
        .join(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .join(EmployeeDepartment, EmployeeDepartment.employee_id == EmployeeProfile.id)
        .join(Department, Department.id == EmployeeDepartment.department_id)
        .where(
            EmployeeProfile.tenant_id == tenant_id,
            Department.name.ilike(dept_name),
            User.is_active.is_(True),
        )
    ).all()
    return [email for email in rows if email]


def _get_dept_user_ids(session: Session, tenant_id: int, dept_name: str) -> list[int]:
    rows = session.exec(
        select(User.id)
        .join(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .join(EmployeeDepartment, EmployeeDepartment.employee_id == EmployeeProfile.id)
        .join(Department, Department.id == EmployeeDepartment.department_id)
        .where(
            EmployeeProfile.tenant_id == tenant_id,
            Department.name.ilike(dept_name),
            User.is_active.is_(True),
        )
    ).all()
    return [uid for uid in rows if uid]


def get_department_recipients(session: Session, tenant_id: int) -> dict[str, list[str]]:
    return {name: _get_dept_emails(session, tenant_id, name) for name in _DEPT_NAMES}


def get_department_user_ids(session: Session, tenant_id: int) -> dict[str, list[int]]:
    return {name: _get_dept_user_ids(session, tenant_id, name) for name in _DEPT_NAMES}


def build_signature_url(token: str) -> str:
    base = settings.public_api_base_url or settings.frontend_base_url
    if base:
        return f"{base.rstrip('/')}/public/sign/{token}"
    return f"/public/sign/{token}"


def build_email_payload(
    event: ContractNotificationEvent,
    contract: Contract,
    *,
    department_label: Optional[str] = None,
) -> tuple[str, str]:
    subject = "Contrato"
    body = ""
    if event == ContractNotificationEvent.DOCS_GENERATED:
        subject = "Contrato: documentos generados"
        body = (
            f"Se han generado los documentos del contrato {contract.id}.\n"
            f"Estado: {contract.status}.\n"
        )
    elif event == ContractNotificationEvent.SUPPLIER_PENDING:
        subject = "Contrato pendiente de proveedor"
        body = f"Contrato {contract.id} pendiente de completar datos del proveedor."
    elif event == ContractNotificationEvent.SUPPLIER_COMPLETED:
        subject = "Proveedor completado"
        body = f"Proveedor completado para el contrato {contract.id}."
    elif event == ContractNotificationEvent.GERENCIA_PENDING:
        subject = "Contrato pendiente de aprobacion (Gerencia)"
        body = f"Contrato {contract.id} listo para revision de Gerencia."
    elif event == ContractNotificationEvent.GERENCIA_APPROVED:
        dept_label = department_label or "Gerencia"
        subject = f"Contrato aprobado por {dept_label}"
        body = f"Contrato {contract.id} aprobado por {dept_label}."
    elif event == ContractNotificationEvent.DEPT_APPROVED:
        dept_label = department_label or "un departamento"
        subject = f"Contrato aprobado por {dept_label}"
        body = f"Contrato {contract.id} aprobado por {dept_label}."
    elif event == ContractNotificationEvent.ALL_APPROVED:
        subject = "Contrato listo para firma"
        body = f"Contrato {contract.id} aprobado por todos los departamentos."
    elif event == ContractNotificationEvent.SIGNATURE_SENT:
        subject = "Contrato para firma"
        body = f"Puedes firmar el contrato aqui: {build_signature_url('TOKEN')}"
    elif event == ContractNotificationEvent.SIGNED:
        subject = "Contrato firmado"
        body = f"Contrato {contract.id} firmado por el proveedor."
    elif event == ContractNotificationEvent.REJECTED:
        subject = "Contrato rechazado"
        reason = contract.rejected_reason or ""
        body = f"Contrato {contract.id} ha sido rechazado."
        if reason:
            body = f"{body}\nMotivo: {reason}"
    return subject, body


def send_contract_notification(
    session: Session,
    *,
    event: ContractNotificationEvent,
    contract: Contract,
    recipients: Iterable[str],
    signature_token: Optional[str] = None,
    department_label: Optional[str] = None,
) -> int:
    recipients_list = _merge_recipients(recipients)
    if not recipients_list:
        return 0

    subject, body = build_email_payload(event, contract, department_label=department_label)
    if event == ContractNotificationEvent.SIGNATURE_SENT and signature_token:
        body = body.replace("TOKEN", signature_token)

    sent_count = 0
    for email in recipients_list:
        exists = session.exec(
            select(ContractNotificationLog).where(
                ContractNotificationLog.tenant_id == contract.tenant_id,
                ContractNotificationLog.contract_id == contract.id,
                ContractNotificationLog.event_type == event,
                ContractNotificationLog.recipient_email == email,
            )
        ).one_or_none()
        if exists:
            continue

        _send_email([email], subject, body)
        log_entry = ContractNotificationLog(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            event_type=event,
            recipient_email=email,
        )
        session.add(log_entry)
        session.commit()
        sent_count += 1

    return sent_count
