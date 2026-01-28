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

from app.ai.client import OllamaClient, build_extraction_meta, normalize_invoice_json
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.core.config import settings
from app.core.email import send_invoice_due_reminder_email
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


def _ocr_pdf(path: str, client: OllamaClient) -> str:
    pages = convert_from_path(path, dpi=200)
    ocr_texts = []
    for page in pages:
        ocr_texts.append(client.ocr_image_to_text(_image_bytes_from_pil(page)))
    return "\n".join(ocr_texts).strip()


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
            normalized_json = normalize_invoice_json(raw_json)
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
                _send_reminder_if_needed(session, invoice, reminder_type, today)

            if settings.reminders_daily_enabled and days_until <= settings.reminders_daily_threshold:
                _send_reminder_if_needed(session, invoice, NotificationType.DUE_DAILY, today)


def _send_reminder_if_needed(
    session: Session,
    invoice: Invoice,
    reminder_type: NotificationType,
    scheduled_for: date,
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
    if not recipient or not recipient.email:
        return

    try:
        send_invoice_due_reminder_email(recipient.email, invoice)
    except Exception as exc:
        logger.exception("Error enviando recordatorio de factura: %s", exc)
        return

    log_entry = NotificationLog(
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        notification_type=reminder_type,
        recipient_email=recipient.email,
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
