import logging
from datetime import datetime

from celery import Task
from sqlmodel import Session, select

from app.contracts.models import Contract, ContractNotificationEvent, ContractOffer
from app.contracts.notifications import get_department_recipients, send_contract_notification as send_contract_email
from app.contracts.documents import generate_comparative, generate_contract
from app.contracts.models import ContractDocument, ContractDocumentType
from app.db.session import engine
from app.models.user import User
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

        recipients = []
        dept_recipients = get_department_recipients(session, contract.tenant_id)

        if event == ContractNotificationEvent.GERENCIA_PENDING:
            recipients = dept_recipients.get("gerencia", [])
        elif event == ContractNotificationEvent.GERENCIA_APPROVED:
            recipients = [
                *dept_recipients.get("administracion", []),
                *dept_recipients.get("compras", []),
                *dept_recipients.get("juridico", []),
            ]
        elif event == ContractNotificationEvent.DEPT_APPROVED:
            recipients = [
                *dept_recipients.get("gerencia", []),
                *dept_recipients.get("jefe_obra", []),
            ]
        elif event == ContractNotificationEvent.SIGNATURE_SENT:
            if contract.supplier_email:
                recipients = [contract.supplier_email]
        elif event == ContractNotificationEvent.SIGNED:
            creator = session.get(User, contract.created_by_id)
            recipients = [
                *(dept_recipients.get("gerencia", [])),
                *(dept_recipients.get("administracion", [])),
                *(dept_recipients.get("compras", [])),
                *(dept_recipients.get("juridico", [])),
            ]
            if creator and creator.email:
                recipients.append(creator.email)
        elif event == ContractNotificationEvent.REJECTED:
            creator = session.get(User, contract.created_by_id)
            recipients = [
                *(dept_recipients.get("gerencia", [])),
                *(dept_recipients.get("administracion", [])),
                *(dept_recipients.get("compras", [])),
                *(dept_recipients.get("juridico", [])),
            ]
            if creator and creator.email:
                recipients.append(creator.email)
        else:
            creator = session.get(User, contract.created_by_id)
            if creator and creator.email:
                recipients = [creator.email]

        send_contract_email(
            session,
            event=event,
            contract=contract,
            recipients=recipients,
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
