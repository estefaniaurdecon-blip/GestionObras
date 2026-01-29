from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from sqlalchemy import delete

from app.invoices.models import (
    Invoice,
    InvoiceEvent,
    InvoiceEventType,
    InvoiceStatus,
    NotificationLog,
)
from app.invoices.schemas import InvoiceExtractionData, InvoiceUpdate
from app.models.erp import Milestone, Project
from app.storage.local import delete_invoice_file, save_upload_to_disk


def _get_invoice_or_404(
    session: Session,
    invoice_id: int,
    tenant_id: int,
) -> Invoice:
    statement = select(Invoice).where(
        Invoice.id == invoice_id,
        Invoice.tenant_id == tenant_id,
    )
    invoice = session.exec(statement).one_or_none()
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Factura no encontrada.",
        )
    return invoice


def _ensure_active_project(
    session: Session,
    tenant_id: int,
    project_id: int,
) -> None:
    statement = select(Project).where(
        Project.id == project_id,
        Project.tenant_id == tenant_id,
        Project.is_active == True,  # noqa: E712
    )
    project = session.exec(statement).one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El proyecto debe existir y estar activo.",
        )


def _ensure_project_milestone(
    session: Session,
    tenant_id: int,
    project_id: int,
    milestone_id: int,
) -> None:
    statement = select(Milestone).where(
        Milestone.id == milestone_id,
        Milestone.project_id == project_id,
        Milestone.tenant_id == tenant_id,
    )
    milestone = session.exec(statement).one_or_none()
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El hito debe pertenecer al proyecto seleccionado.",
        )


def list_invoices(
    session: Session,
    tenant_id: int,
    project_id: Optional[int] = None,
    department_id: Optional[int] = None,
    status: Optional[InvoiceStatus] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Invoice]:
    """
    Devuelve las facturas del tenant con filtros opcionales.
    """
    statement = select(Invoice).where(Invoice.tenant_id == tenant_id)

    if project_id is not None:
        statement = statement.where(Invoice.project_id == project_id)
    if department_id is not None:
        statement = statement.where(Invoice.department_id == department_id)
    if status is not None:
        statement = statement.where(Invoice.status == status)
    if date_from is not None:
        statement = statement.where(Invoice.issue_date >= date_from)
    if date_to is not None:
        statement = statement.where(Invoice.issue_date <= date_to)

    statement = statement.order_by(Invoice.created_at.desc())
    return list(session.exec(statement).all())


def create_invoice_with_upload(
    session: Session,
    tenant_id: int,
    created_by_id: int,
    upload: UploadFile,
    project_id: Optional[int] = None,
    subsidizable: Optional[bool] = None,
    expense_type: Optional[str] = None,
    milestone_id: Optional[int] = None,
) -> Invoice:
    """
    Crea el registro de factura y guarda el archivo en disco.
    """
    if project_id is not None:
        _ensure_active_project(session, tenant_id, project_id)

    if milestone_id is not None and project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El hito requiere un proyecto asociado.",
        )
    if project_id is not None and milestone_id is not None:
        _ensure_project_milestone(session, tenant_id, project_id, milestone_id)

    invoice = Invoice(
        tenant_id=tenant_id,
        created_by_id=created_by_id,
        project_id=project_id,
        file_path="",
        original_filename=upload.filename,
        status=InvoiceStatus.UPLOADED,
        subsidizable=subsidizable,
        expense_type=expense_type,
        milestone_id=milestone_id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    stored_path = save_upload_to_disk(upload, tenant_id, invoice.id)
    invoice.file_path = str(stored_path)
    invoice.updated_at = datetime.utcnow()
    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    log_invoice_event(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice.id,
        user_id=created_by_id,
        event_type=InvoiceEventType.UPLOADED,
        payload={"filename": upload.filename},
    )

    return invoice


def get_invoice(session: Session, invoice_id: int, tenant_id: int) -> Invoice:
    return _get_invoice_or_404(session, invoice_id, tenant_id)


def update_invoice(
    session: Session,
    invoice_id: int,
    tenant_id: int,
    payload: InvoiceUpdate,
    user_id: Optional[int],
) -> Invoice:
    invoice = _get_invoice_or_404(session, invoice_id, tenant_id)

    data = payload.model_dump(exclude_unset=True)
    if "project_id" in data and data["project_id"] is not None:
        _ensure_active_project(session, tenant_id, data["project_id"])
        if "milestone_id" not in data and invoice.milestone_id is not None:
            _ensure_project_milestone(
                session, tenant_id, data["project_id"], invoice.milestone_id
            )
    if "milestone_id" in data and data["milestone_id"] is not None:
        project_id = data.get("project_id") or invoice.project_id
        if project_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El hito requiere un proyecto asociado.",
            )
        _ensure_project_milestone(
            session, tenant_id, project_id, data["milestone_id"]
        )

    for field, value in data.items():
        setattr(invoice, field, value)

    invoice.updated_at = datetime.utcnow()
    if payload.status == InvoiceStatus.VALIDATED:
        invoice.validated_at = datetime.utcnow()

    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    if payload.status == InvoiceStatus.VALIDATED:
        log_invoice_event(
            session,
            tenant_id=tenant_id,
            invoice_id=invoice.id,
            user_id=user_id,
            event_type=InvoiceEventType.VALIDATED,
            payload=None,
        )

    return invoice


def mark_invoice_paid(
    session: Session,
    invoice_id: int,
    tenant_id: int,
    user_id: Optional[int],
) -> Invoice:
    invoice = _get_invoice_or_404(session, invoice_id, tenant_id)
    invoice.status = InvoiceStatus.PAID
    invoice.paid_at = datetime.utcnow()
    invoice.updated_at = datetime.utcnow()

    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    log_invoice_event(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice.id,
        user_id=user_id,
        event_type=InvoiceEventType.PAID,
        payload=None,
    )

    return invoice


def delete_invoice(
    session: Session,
    invoice_id: int,
    tenant_id: int,
) -> None:
    invoice = _get_invoice_or_404(session, invoice_id, tenant_id)

    # Borra dependencias para evitar FK violations.
    session.exec(
        delete(InvoiceEvent).where(
            InvoiceEvent.invoice_id == invoice.id,
            InvoiceEvent.tenant_id == tenant_id,
        )
    )
    session.exec(
        delete(NotificationLog).where(
            NotificationLog.invoice_id == invoice.id,
            NotificationLog.tenant_id == tenant_id,
        )
    )

    if invoice.file_path:
        delete_invoice_file(invoice.file_path)
    session.delete(invoice)
    session.commit()


def prepare_reprocess(
    session: Session,
    invoice_id: int,
    tenant_id: int,
) -> Invoice:
    invoice = _get_invoice_or_404(session, invoice_id, tenant_id)
    invoice.status = InvoiceStatus.EXTRACTING
    invoice.extraction_error = None
    invoice.updated_at = datetime.utcnow()

    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    return invoice


def apply_extraction(
    session: Session,
    invoice: Invoice,
    extraction: InvoiceExtractionData,
    raw_text: str,
    raw_json: dict,
    meta: dict,
) -> Invoice:
    invoice.supplier_name = extraction.supplier_name
    invoice.supplier_tax_id = extraction.supplier_tax_id
    invoice.invoice_number = extraction.invoice_number
    invoice.issue_date = extraction.issue_date
    invoice.due_date = extraction.due_date
    invoice.total_amount = extraction.total_amount
    invoice.currency = extraction.currency
    invoice.concept = extraction.concept
    invoice.raw_text = raw_text
    invoice.extraction_raw_json = raw_json
    invoice.extraction_meta = meta
    invoice.status = InvoiceStatus.EXTRACTED
    invoice.extracted_at = datetime.utcnow()
    invoice.updated_at = datetime.utcnow()

    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    log_invoice_event(
        session,
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        user_id=None,
        event_type=InvoiceEventType.EXTRACTED,
        payload={"meta": meta},
    )

    return invoice


def mark_extraction_failed(
    session: Session,
    invoice: Invoice,
    error_message: str,
) -> Invoice:
    invoice.status = InvoiceStatus.FAILED
    invoice.extraction_error = error_message
    invoice.updated_at = datetime.utcnow()

    session.add(invoice)
    session.commit()
    session.refresh(invoice)

    log_invoice_event(
        session,
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        user_id=None,
        event_type=InvoiceEventType.FAILED,
        payload={"error": error_message},
    )

    return invoice


def log_invoice_event(
    session: Session,
    tenant_id: int,
    invoice_id: int,
    user_id: Optional[int],
    event_type: InvoiceEventType,
    payload: Optional[dict],
) -> None:
    event = InvoiceEvent(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        user_id=user_id,
        event_type=event_type,
        payload=payload,
    )
    session.add(event)
    session.commit()
