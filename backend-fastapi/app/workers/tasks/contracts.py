import logging
from datetime import datetime

from celery import Task
from sqlmodel import Session, select

from app.contracts.models import Contract, ContractNotificationEvent, ContractOffer
from app.contracts.notifications import (
    build_email_payload,
    get_department_user_ids,
    send_contract_notification as send_contract_email,
)
from app.contracts.documents import generate_comparative, generate_contract
from app.contracts.models import ContractDocument, ContractDocumentType
from app.db.session import engine
from app.models.notification import NotificationType
from app.models.user import User
from app.services.notification_service import create_notification
from app.workers.celery_app import celery_app


logger = logging.getLogger("app.contracts")


class BaseContractTask(Task):
    autoretry_for = ()
    retry_backoff = True
    retry_jitter = True
    max_retries = 3


@celery_app.task(bind=True, base=BaseContractTask, name="app.workers.tasks.contracts.generate_contract_docs")
def generate_contract_docs(self: BaseContractTask, contract_id: int) -> None:
    with Session(engine) as session:
        contract = session.get(Contract, contract_id)
        if not contract:
            return

        existing = session.exec(
            select(ContractDocument).where(
                ContractDocument.contract_id == contract.id,
                ContractDocument.tenant_id == contract.tenant_id,
            )
        ).all()
        existing_types = {doc.doc_type for doc in existing}

        comparative_path = generate_comparative(contract)
        if ContractDocumentType.COMPARATIVE not in existing_types:
            session.add(
                ContractDocument(
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    doc_type=ContractDocumentType.COMPARATIVE,
                    path=str(comparative_path),
                    created_by_id=None,
                )
            )

        contract_path = generate_contract(contract)
        if contract_path and ContractDocumentType.CONTRACT not in existing_types:
            session.add(
                ContractDocument(
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    doc_type=ContractDocumentType.CONTRACT,
                    path=str(contract_path),
                    created_by_id=None,
                )
            )

        session.commit()


@celery_app.task(name="app.workers.tasks.contracts.send_contract_notification")
def send_contract_notification(
    event: ContractNotificationEvent,
    contract_id: int,
    signature_token: str | None = None,
    department_label: str | None = None,
) -> None:
    with Session(engine) as session:
        if isinstance(event, str):
            event = ContractNotificationEvent(event)
        contract = session.get(Contract, contract_id)
        if not contract:
            return
        dept_users = get_department_user_ids(session, contract.tenant_id)
        internal_user_ids: list[int] = []

        if event == ContractNotificationEvent.DOCS_GENERATED:
            internal_user_ids = [contract.created_by_id]
        elif event == ContractNotificationEvent.SUPPLIER_PENDING:
            internal_user_ids = [contract.created_by_id]
        elif event == ContractNotificationEvent.SUPPLIER_COMPLETED:
            internal_user_ids = [contract.created_by_id]
        elif event == ContractNotificationEvent.GERENCIA_PENDING:
            internal_user_ids = dept_users.get("gerencia", [])
        elif event == ContractNotificationEvent.GERENCIA_APPROVED:
            internal_user_ids = [
                *dept_users.get("administracion", []),
                *dept_users.get("compras", []),
                *dept_users.get("juridico", []),
            ]
        elif event == ContractNotificationEvent.DEPT_APPROVED:
            internal_user_ids = [
                *dept_users.get("gerencia", []),
                contract.created_by_id,
            ]
        elif event == ContractNotificationEvent.SIGNED:
            internal_user_ids = [
                *dept_users.get("gerencia", []),
                *dept_users.get("administracion", []),
                *dept_users.get("compras", []),
                *dept_users.get("juridico", []),
                contract.created_by_id,
            ]
        elif event == ContractNotificationEvent.REJECTED:
            internal_user_ids = [contract.created_by_id]

        title, body = build_email_payload(
            event,
            contract,
            department_label=department_label,
        )
        for user_id in sorted({uid for uid in internal_user_ids if uid}):
            create_notification(
                session,
                tenant_id=contract.tenant_id,
                user_id=user_id,
                type=NotificationType.GENERIC,
                title=title,
                body=body,
                reference=f"contract_id={contract.id}",
            )

        if event == ContractNotificationEvent.SIGNATURE_SENT:
            if contract.supplier_email:
                send_contract_email(
                    session,
                    event=event,
                    contract=contract,
                    recipients=[contract.supplier_email],
                    signature_token=signature_token,
                    department_label=department_label,
                )


@celery_app.task(name="app.workers.tasks.contracts.ocr_extract_offer")
def ocr_extract_offer(offer_id: int) -> None:
    with Session(engine) as session:
        offer = session.get(ContractOffer, offer_id)
        if not offer:
            return
        offer.extraction_meta = {
            "status": "skipped",
            "reason": "OCR hook placeholder",
            "timestamp": datetime.utcnow().isoformat(),
        }
        session.add(offer)
        session.commit()
