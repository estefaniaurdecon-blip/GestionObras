import io
import logging
from datetime import date, datetime
from typing import Optional

import pdfplumber
import redis
from celery import Task
from pdf2image import convert_from_path
from PIL import Image
from sqlmodel import Session, select

from app.ai.client import (
    OllamaClient,
    build_extraction_meta,
    normalize_invoice_json,
    _looks_like_customer,
    _find_supplier_name_in_header,
)
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.core.config import settings
from app.core.email import send_invoice_created_email, send_invoice_due_reminder_email
from app.db.session import engine
from app.invoices.models import (
    Invoice,
    InvoiceEventType,
    InvoiceStatus,
    NotificationLog,
    NotificationType,
)
from app.invoices.schemas import InvoiceExtractionData
from app.invoices.service import apply_extraction, log_invoice_event, mark_extraction_failed
from app.models.user import User
from app.workers.celery_app import celery_app


logger = logging.getLogger("app.invoices")


def _merge_recipients(*groups: list[str]) -> list[str]:
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


def _get_base_recipients(recipient_email: Optional[str]) -> list[str]:
    base = []
    if recipient_email:
        base.append(recipient_email)
    return _merge_recipients(base, settings.invoice_due_base_recipients)


def _get_due_recipients(
    recipient_email: Optional[str],
    reminder_type: NotificationType,
) -> list[str]:
    base = _get_base_recipients(recipient_email)
    if reminder_type == NotificationType.DUE_10:
        return _merge_recipients(base, settings.invoice_due_extra_recipients_10)
    if reminder_type == NotificationType.DUE_5:
        return _merge_recipients(base, settings.invoice_due_extra_recipients_5)
    return base


def _get_created_recipients(recipient_email: Optional[str]) -> list[str]:
    base = [recipient_email] if recipient_email else []
    return _merge_recipients(base, settings.invoice_created_extra_recipients)


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _ai_breaker_key() -> str:
    return "ai:down"


def _is_ai_down(client: redis.Redis) -> Optional[int]:
    ttl = client.ttl(_ai_breaker_key())
    return ttl if ttl and ttl > 0 else None


def _set_ai_down(client: redis.Redis) -> None:
    client.set(_ai_breaker_key(), "1", ex=settings.ai_circuit_breaker_ttl_seconds)


def _clear_ai_down(client: redis.Redis) -> None:
    client.delete(_ai_breaker_key())


def _extract_text_pdf(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        texts = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(texts).strip()


def _image_bytes_from_pil(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _ocr_pdf(path: str, client: OllamaClient, dpi: int = 200) -> str:
    pages = convert_from_path(path, dpi=dpi)
    ocr_texts = []
    for page in pages:
        ocr_texts.append(client.ocr_image_to_text(_image_bytes_from_pil(page)))
    return "\n".join(ocr_texts).strip()


def _ocr_pdf_high(path: str, client: OllamaClient) -> str:
    return _ocr_pdf(path, client, dpi=300)


def _ocr_pdf_header(path: str, client: OllamaClient, dpi: int = 400) -> str:
    pages = convert_from_path(path, dpi=dpi, first_page=1, last_page=1)
    if not pages:
        return ""
    page = pages[0]
    width, height = page.size
    crop_box = (0, 0, width, int(height * 0.35))
    header_img = page.crop(crop_box)
    return client.ocr_image_to_text(_image_bytes_from_pil(header_img)).strip()


def _ocr_image(path: str, client: OllamaClient) -> str:
    with Image.open(path) as img:
        return client.ocr_image_to_text(_image_bytes_from_pil(img))


def _should_ocr(text: str) -> bool:
    return len(text.strip()) < settings.invoice_min_text_length


class BaseInvoiceTask(Task):
    autoretry_for = (AIUnavailableError,)
    retry_backoff = True
    retry_jitter = True
    max_retries = 5


@celery_app.task(bind=True, base=BaseInvoiceTask, name="app.workers.tasks.invoices.extract_invoice")
def extract_invoice(self: BaseInvoiceTask, invoice_id: int) -> None:
    client = _redis_client()
    ttl = _is_ai_down(client)
    if ttl:
        raise self.retry(countdown=ttl)

    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)
        if not invoice:
            return
        if invoice.status in {InvoiceStatus.EXTRACTED, InvoiceStatus.VALIDATED, InvoiceStatus.PAID}:
            return

        invoice.status = InvoiceStatus.EXTRACTING
        invoice.updated_at = datetime.utcnow()
        session.add(invoice)
        session.commit()

        ai_client = OllamaClient()
        start = datetime.utcnow()

        try:
            path_lower = invoice.file_path.lower()
            is_image = path_lower.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp"))
            if is_image:
                text = _ocr_image(invoice.file_path, ai_client)
            else:
                text = _extract_text_pdf(invoice.file_path)
                if _should_ocr(text):
                    text = _ocr_pdf(invoice.file_path, ai_client)

            raw_json = ai_client.invoice_text_to_json(text)
            normalized_json = normalize_invoice_json(raw_json, fallback_text=text)

            if not is_image and _looks_like_customer(normalized_json.get("supplier_name")):
                header_text = _ocr_pdf_header(invoice.file_path, ai_client)
                combined_text = f"{header_text}\n{text}" if header_text else text
                normalized_json = normalize_invoice_json(raw_json, fallback_text=combined_text)
                if _looks_like_customer(normalized_json.get("supplier_name")):
                    ocr_text = _ocr_pdf_high(invoice.file_path, ai_client)
                    if ocr_text and ocr_text != text:
                        raw_json_ocr = ai_client.invoice_text_to_json(ocr_text)
                        combined_ocr = (
                            f"{header_text}\n{ocr_text}" if header_text else ocr_text
                        )
                        normalized_json_ocr = normalize_invoice_json(raw_json_ocr, fallback_text=combined_ocr)
                        if not _looks_like_customer(normalized_json_ocr.get("supplier_name")):
                            text = ocr_text
                            raw_json = raw_json_ocr
                            normalized_json = normalized_json_ocr
                if _looks_like_customer(normalized_json.get("supplier_name")) and header_text:
                    header_guess = _find_supplier_name_in_header(header_text)
                    if header_guess:
                        normalized_json["supplier_name"] = header_guess
            extraction = InvoiceExtractionData.model_validate(normalized_json)
            meta = build_extraction_meta()
            meta["started_at"] = start.isoformat()
            meta["finished_at"] = datetime.utcnow().isoformat()

            apply_extraction(
                session=session,
                invoice=invoice,
                extraction=extraction,
                raw_text=text,
                raw_json=raw_json,
                meta=meta,
            )
            # Enviar correo de "factura registrada" cuando ya tenemos datos extraídos.
            send_invoice_created_notification(invoice.id)
        except AIUnavailableError:
            _set_ai_down(client)
            raise
        except AIInvalidResponseError as exc:
            mark_extraction_failed(session=session, invoice=invoice, error_message=str(exc))
        except Exception as exc:
            mark_extraction_failed(session=session, invoice=invoice, error_message=str(exc))


@celery_app.task(name="app.workers.tasks.invoices.send_due_reminders")
def send_due_reminders() -> None:
    today = date.today()
    thresholds = {
        20: NotificationType.DUE_20,
        10: NotificationType.DUE_10,
        5: NotificationType.DUE_5,
        1: NotificationType.DUE_1,
    }

    with Session(engine) as session:
        statement = select(Invoice).where(
            Invoice.due_date.is_not(None),
            Invoice.status != InvoiceStatus.PAID,
        )
        invoices = session.exec(statement).all()

        for invoice in invoices:
            if not invoice.due_date:
                continue
            days_until = (invoice.due_date - today).days
            if days_until < 0:
                continue

            reminder_type = thresholds.get(days_until)
            if reminder_type:
                _send_reminder_if_needed(session, invoice, reminder_type, today, days_until)

            if settings.reminders_daily_enabled and days_until <= settings.reminders_daily_threshold:
                _send_reminder_if_needed(
                    session,
                    invoice,
                    NotificationType.DUE_DAILY,
                    today,
                    days_until,
                )


def _send_reminder_if_needed(
    session: Session,
    invoice: Invoice,
    reminder_type: NotificationType,
    scheduled_for: date,
    days_until: int,
) -> None:
    exists = session.exec(
        select(NotificationLog).where(
            NotificationLog.tenant_id == invoice.tenant_id,
            NotificationLog.invoice_id == invoice.id,
            NotificationLog.notification_type == reminder_type,
            NotificationLog.scheduled_for == scheduled_for,
        )
    ).one_or_none()
    if exists:
        return

    recipient = session.get(User, invoice.created_by_id)
    recipient_email = recipient.email if recipient else None
    recipients = _get_due_recipients(recipient_email, reminder_type)
    if not recipients:
        return

    try:
        send_invoice_due_reminder_email(recipients, invoice, days_until=days_until)
    except Exception as exc:
        logger.exception("Error enviando recordatorio de factura: %s", exc)
        return

    log_entry = NotificationLog(
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        notification_type=reminder_type,
        recipient_email=recipients[0] if recipients else None,
        scheduled_for=scheduled_for,
    )
    session.add(log_entry)
    session.commit()

    log_invoice_event(
        session=session,
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        user_id=None,
        event_type=InvoiceEventType.REMINDER_SENT,
        payload={"type": reminder_type, "date": scheduled_for.isoformat()},
    )


@celery_app.task(name="app.workers.tasks.invoices.send_invoice_created_notification")
def send_invoice_created_notification(invoice_id: int) -> None:
    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)
        if not invoice:
            return

        scheduled_for = invoice.created_at.date() if invoice.created_at else date.today()
        exists = session.exec(
            select(NotificationLog).where(
                NotificationLog.tenant_id == invoice.tenant_id,
                NotificationLog.invoice_id == invoice.id,
                NotificationLog.notification_type == NotificationType.CREATED,
                NotificationLog.scheduled_for == scheduled_for,
            )
        ).one_or_none()
        if exists:
            return

        recipient = session.get(User, invoice.created_by_id)
        recipient_email = recipient.email if recipient else None
        recipients = _get_created_recipients(recipient_email)
        if not recipients:
            return

        try:
            send_invoice_created_email(recipients, invoice)
        except Exception as exc:
            logger.exception("Error enviando correo de factura registrada: %s", exc)
            return

        log_entry = NotificationLog(
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
            notification_type=NotificationType.CREATED,
            recipient_email=recipients[0] if recipients else None,
            scheduled_for=scheduled_for,
        )
        session.add(log_entry)
        session.commit()

        log_invoice_event(
            session=session,
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
            user_id=None,
            event_type=InvoiceEventType.REMINDER_SENT,
            payload={"type": NotificationType.CREATED, "date": scheduled_for.isoformat()},
        )
