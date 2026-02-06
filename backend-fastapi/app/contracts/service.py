from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.contracts.documents import generate_comparative, generate_contract, supplier_data_complete
from app.contracts.models import (
    ApprovalStatus,
    Contract,
    ContractApproval,
    ContractDepartment,
    ContractDocument,
    ContractDocumentType,
    ContractEvent,
    ContractNotificationEvent,
    ContractOffer,
    ContractStatus,
    SignatureRequest,
    SignatureStatus,
)
from app.contracts.permissions import (
    can_approve_contract,
    can_create_contract,
    can_edit_contract,
    can_reject_contract,
    can_view_contract,
    department_for_user,
    ensure_tenant_access,
    is_jefe_obra,
)
from app.contracts.workflows import next_pending_status, ensure_status
from app.core.config import settings
from app.models.user import User
from app.storage.local import save_contract_offer_upload, save_signed_contract_upload
from app.workers.tasks.contracts import send_contract_notification


def _ensure_status_or_400(current: ContractStatus, allowed: list[ContractStatus]) -> None:
    try:
        ensure_status(current, allowed)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

def _get_contract_or_404(session: Session, contract_id: int, tenant_id: int) -> Contract:
    statement = select(Contract).where(
        Contract.id == contract_id,
        Contract.tenant_id == tenant_id,
    )
    contract = session.exec(statement).one_or_none()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contrato no encontrado.",
        )
    return contract


def _get_offer_or_404(session: Session, offer_id: int, tenant_id: int) -> ContractOffer:
    statement = select(ContractOffer).where(
        ContractOffer.id == offer_id,
        ContractOffer.tenant_id == tenant_id,
    )
    offer = session.exec(statement).one_or_none()
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Oferta no encontrada.",
        )
    return offer


def _log_event(
    session: Session,
    *,
    tenant_id: int,
    contract_id: int,
    user_id: Optional[int],
    event_type: str,
    payload: Optional[dict] = None,
) -> None:
    event = ContractEvent(
        tenant_id=tenant_id,
        contract_id=contract_id,
        user_id=user_id,
        event_type=event_type,
        payload=payload,
    )
    session.add(event)
    session.commit()


def list_contracts(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    status_filter: Optional[ContractStatus] = None,
    pending_only: bool = False,
) -> list[Contract]:
    ensure_tenant_access(current_user, tenant_id)
    if not can_view_contract(session, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    statement = select(Contract).where(Contract.tenant_id == tenant_id)

    if status_filter is not None:
        statement = statement.where(Contract.status == status_filter)

    if pending_only:
        if is_jefe_obra(session, current_user):
            statement = statement.where(
                Contract.created_by_id == current_user.id,
                Contract.status.in_([
                    ContractStatus.DRAFT,
                    ContractStatus.PENDING_JEFE_OBRA,
                ]),
            )
        else:
            dept = department_for_user(session, current_user)
            if dept == ContractDepartment.GERENCIA:
                statement = statement.where(Contract.status == ContractStatus.PENDING_GERENCIA)
            elif dept in {
                ContractDepartment.ADMIN,
                ContractDepartment.COMPRAS,
                ContractDepartment.JURIDICO,
            }:
                subq = (
                    select(ContractApproval.contract_id)
                    .where(
                        ContractApproval.tenant_id == tenant_id,
                        ContractApproval.department == dept,
                        ContractApproval.status == ApprovalStatus.PENDING,
                    )
                )
                statement = statement.where(Contract.id.in_(subq))
            else:
                statement = statement.where(False)

    statement = statement.order_by(Contract.created_at.desc())
    return list(session.exec(statement).all())


def get_contract(session: Session, *, contract_id: int, tenant_id: int, user: User) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_view_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return _get_contract_or_404(session, contract_id, tenant_id)


def create_contract(
    session: Session,
    *,
    tenant_id: int,
    created_by: User,
    payload: dict,
) -> Contract:
    ensure_tenant_access(created_by, tenant_id)
    if not can_create_contract(session, created_by):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = Contract(
        tenant_id=tenant_id,
        created_by_id=created_by.id,
        type=payload["type"],
        title=payload.get("title"),
        description=payload.get("description"),
        project_id=payload.get("project_id"),
        comparative_data=payload.get("comparative_data"),
        contract_data=payload.get("contract_data"),
        status=ContractStatus.DRAFT,
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=created_by.id,
        event_type="contract.created",
    )

    return contract


def update_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_edit_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede editar en borrador.",
        )

    for field, value in payload.items():
        setattr(contract, field, value)

    contract.updated_at = datetime.utcnow()
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.updated",
    )

    return contract


def add_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict,
    upload: UploadFile,
    user: User,
) -> ContractOffer:
    ensure_tenant_access(user, tenant_id)
    if not can_edit_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden cargar ofertas en borrador.",
        )

    offer = ContractOffer(
        tenant_id=tenant_id,
        contract_id=contract.id,
        created_by_id=user.id,
        supplier_name=payload.get("supplier_name"),
        supplier_tax_id=payload.get("supplier_tax_id"),
        supplier_email=payload.get("supplier_email"),
        supplier_phone=payload.get("supplier_phone"),
        total_amount=payload.get("total_amount"),
        currency=payload.get("currency"),
        notes=payload.get("notes"),
        original_filename=upload.filename,
    )
    session.add(offer)
    session.commit()
    session.refresh(offer)

    stored_path = save_contract_offer_upload(upload, tenant_id, contract.id, offer.id)
    offer.file_path = str(stored_path)
    session.add(offer)
    session.commit()
    session.refresh(offer)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.offer_added",
        payload={"offer_id": offer.id},
    )

    return offer


def select_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    offer_id: int,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_edit_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede seleccionar oferta en borrador.",
        )

    offer = _get_offer_or_404(session, offer_id, tenant_id)
    if offer.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Oferta no valida")

    contract.selected_offer_id = offer.id
    if offer.supplier_name and not contract.supplier_name:
        contract.supplier_name = offer.supplier_name
    if offer.supplier_tax_id and not contract.supplier_tax_id:
        contract.supplier_tax_id = offer.supplier_tax_id
    if offer.supplier_email and not contract.supplier_email:
        contract.supplier_email = offer.supplier_email
    if offer.supplier_phone and not contract.supplier_phone:
        contract.supplier_phone = offer.supplier_phone
    if offer.total_amount and not contract.total_amount:
        contract.total_amount = offer.total_amount
    if offer.currency and not contract.currency:
        contract.currency = offer.currency

    contract.updated_at = datetime.utcnow()
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.offer_selected",
        payload={"offer_id": offer.id},
    )

    return contract


def create_documents_for_contract(
    session: Session,
    *,
    contract: Contract,
    created_by_id: Optional[int],
) -> list[ContractDocument]:
    documents: list[ContractDocument] = []

    existing_docs = session.exec(
        select(ContractDocument).where(
            ContractDocument.contract_id == contract.id,
            ContractDocument.tenant_id == contract.tenant_id,
        )
    ).all()
    existing_types = {doc.doc_type for doc in existing_docs}

    comparative_path = generate_comparative(contract)
    if ContractDocumentType.COMPARATIVE not in existing_types:
        documents.append(
            ContractDocument(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                doc_type=ContractDocumentType.COMPARATIVE,
                path=str(comparative_path),
                created_by_id=created_by_id,
            )
        )

    contract_path = generate_contract(contract)
    if contract_path and ContractDocumentType.CONTRACT not in existing_types:
        documents.append(
            ContractDocument(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                doc_type=ContractDocumentType.CONTRACT,
                path=str(contract_path),
                created_by_id=created_by_id,
            )
        )

    if documents:
        session.add_all(documents)
        session.commit()
    return documents


def generate_docs(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_edit_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    _ensure_status_or_400(contract.status, [ContractStatus.DRAFT])

    create_documents_for_contract(session, contract=contract, created_by_id=user.id)

    contract.status = ContractStatus.PENDING_JEFE_OBRA
    contract.updated_at = datetime.utcnow()
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.docs_generated",
        payload={"supplier_complete": supplier_data_complete(contract)},
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.DOCS_GENERATED,
        contract_id=contract.id,
    )
    send_contract_notification.delay(
        event=ContractNotificationEvent.GERENCIA_PENDING,
        contract_id=contract.id,
    )

    return contract


def submit_gerencia(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not (user.is_super_admin or is_jefe_obra(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    _ensure_status_or_400(contract.status, [ContractStatus.PENDING_JEFE_OBRA])

    contract.status = ContractStatus.PENDING_GERENCIA
    contract.submitted_at = datetime.utcnow()
    contract.updated_at = datetime.utcnow()
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.submitted_gerencia",
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.GERENCIA_PENDING,
        contract_id=contract.id,
    )

    return contract


def _upsert_approval(
    session: Session,
    *,
    contract: Contract,
    department: ContractDepartment,
    status: ApprovalStatus,
    decided_by_id: Optional[int],
    comment: Optional[str],
) -> ContractApproval:
    approval = session.exec(
        select(ContractApproval).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
            ContractApproval.department == department,
        )
    ).one_or_none()

    if approval is None:
        approval = ContractApproval(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            department=department,
        )

    approval.status = status
    approval.decided_by_id = decided_by_id
    approval.decided_at = datetime.utcnow()
    approval.comment = comment
    session.add(approval)
    session.commit()
    session.refresh(approval)
    return approval


def _ensure_department_approvals(session: Session, contract: Contract) -> list[ContractApproval]:
    approvals = session.exec(
        select(ContractApproval).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
        )
    ).all()
    existing = {approval.department for approval in approvals}
    to_create = []
    for dept in (
        ContractDepartment.ADMIN,
        ContractDepartment.COMPRAS,
        ContractDepartment.JURIDICO,
    ):
        if dept in existing:
            continue
        to_create.append(
            ContractApproval(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                department=dept,
                status=ApprovalStatus.PENDING,
            )
        )
    if to_create:
        session.add_all(to_create)
        session.commit()
        approvals = session.exec(
            select(ContractApproval).where(
                ContractApproval.tenant_id == contract.tenant_id,
                ContractApproval.contract_id == contract.id,
            )
        ).all()
    return approvals


def _all_final_approvals_completed(approvals: list[ContractApproval]) -> bool:
    for dept in (
        ContractDepartment.ADMIN,
        ContractDepartment.COMPRAS,
        ContractDepartment.JURIDICO,
    ):
        approval = next((a for a in approvals if a.department == dept), None)
        if not approval or approval.status != ApprovalStatus.APPROVED:
            return False
    return True


def approve_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: Optional[str],
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_approve_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    dept = department_for_user(session, user)
    if user.is_super_admin and dept is None:
        if contract.status == ContractStatus.PENDING_GERENCIA:
            dept = ContractDepartment.GERENCIA
        else:
            dept = ContractDepartment.ADMIN

    if dept == ContractDepartment.GERENCIA:
        _ensure_status_or_400(contract.status, [ContractStatus.PENDING_GERENCIA])
        _upsert_approval(
            session,
            contract=contract,
            department=ContractDepartment.GERENCIA,
            status=ApprovalStatus.APPROVED,
            decided_by_id=user.id,
            comment=comment,
        )

        approvals = _ensure_department_approvals(session, contract)
        contract.status = next_pending_status(approvals) or ContractStatus.PENDING_ADMIN
        contract.updated_at = datetime.utcnow()
        session.add(contract)
        session.commit()
        session.refresh(contract)

        _log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.gerencia_approved",
        )

        send_contract_notification.delay(
            event=ContractNotificationEvent.GERENCIA_APPROVED,
            contract_id=contract.id,
        )
        return contract

    if dept in {
        ContractDepartment.ADMIN,
        ContractDepartment.COMPRAS,
        ContractDepartment.JURIDICO,
    }:
        _ensure_status_or_400(
            contract.status,
            [
                ContractStatus.PENDING_ADMIN,
                ContractStatus.PENDING_COMPRAS,
                ContractStatus.PENDING_JURIDICO,
            ],
        )
        _upsert_approval(
            session,
            contract=contract,
            department=dept,
            status=ApprovalStatus.APPROVED,
            decided_by_id=user.id,
            comment=comment,
        )

        approvals = _ensure_department_approvals(session, contract)
        if _all_final_approvals_completed(approvals):
            contract.status = ContractStatus.IN_SIGNATURE
            contract.approved_at = datetime.utcnow()
            contract.updated_at = datetime.utcnow()
            session.add(contract)
            session.commit()
            session.refresh(contract)

            signature_request = create_signature_request(session, contract=contract)
            send_contract_notification.delay(
                event=ContractNotificationEvent.SIGNATURE_SENT,
                contract_id=contract.id,
                signature_token=signature_request.token,
            )
        else:
            contract.status = next_pending_status(approvals) or contract.status
            contract.updated_at = datetime.utcnow()
            session.add(contract)
            session.commit()
            session.refresh(contract)
        return contract

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Departamento no autorizado para aprobar.",
    )


def reject_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    reason: str,
    back_to_status: Optional[ContractStatus],
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_reject_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    dept = department_for_user(session, user)
    if user.is_super_admin and dept is None:
        if contract.status == ContractStatus.PENDING_GERENCIA:
            dept = ContractDepartment.GERENCIA
        else:
            dept = ContractDepartment.ADMIN
    if not dept and not user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    _upsert_approval(
        session,
        contract=contract,
        department=dept or ContractDepartment.GERENCIA,
        status=ApprovalStatus.REJECTED,
        decided_by_id=user.id,
        comment=reason,
    )

    contract.status = ContractStatus.REJECTED
    contract.rejected_reason = reason
    contract.rejected_by_id = user.id
    contract.rejected_at = datetime.utcnow()
    contract.rejected_to_status = back_to_status
    contract.updated_at = datetime.utcnow()
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.rejected",
        payload={"reason": reason, "back_to": back_to_status},
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.REJECTED,
        contract_id=contract.id,
    )

    return contract


def create_signature_request(session: Session, *, contract: Contract) -> SignatureRequest:
    now = datetime.utcnow()
    existing = session.exec(
        select(SignatureRequest).where(
            SignatureRequest.contract_id == contract.id,
            SignatureRequest.tenant_id == contract.tenant_id,
            SignatureRequest.status == SignatureStatus.SENT,
        )
    ).one_or_none()
    if existing and existing.expires_at > now:
        return existing

    token = uuid4().hex
    expires_at = now + timedelta(hours=settings.signature_request_ttl_hours)
    request = SignatureRequest(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        token=token,
        expires_at=expires_at,
        status=SignatureStatus.SENT,
        recipient_email=contract.supplier_email,
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


def sign_contract_by_token(
    session: Session,
    *,
    token: str,
    upload: Optional[UploadFile],
    signer_ip: Optional[str],
) -> SignatureRequest:
    signature = session.exec(
        select(SignatureRequest).where(SignatureRequest.token == token)
    ).one_or_none()
    if not signature:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido")

    if signature.status == SignatureStatus.SIGNED:
        return signature

    if signature.expires_at < datetime.utcnow():
        signature.status = SignatureStatus.EXPIRED
        session.add(signature)
        session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expirado")

    contract = session.get(Contract, signature.contract_id)
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado")

    signed_file_path = None
    if upload:
        signed_file_path = save_signed_contract_upload(upload, contract.tenant_id, contract.id)
        signature.signed_file_path = str(signed_file_path)
        doc = ContractDocument(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            doc_type=ContractDocumentType.SIGNED,
            path=str(signed_file_path),
            created_by_id=None,
        )
        session.add(doc)

    signature.status = SignatureStatus.SIGNED
    signature.signed_at = datetime.utcnow()
    signature.signed_ip = signer_ip
    session.add(signature)

    contract.status = ContractStatus.SIGNED
    contract.signed_at = signature.signed_at
    contract.updated_at = datetime.utcnow()
    session.add(contract)

    session.commit()
    session.refresh(signature)

    _log_event(
        session,
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        user_id=None,
        event_type="contract.signed",
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.SIGNED,
        contract_id=contract.id,
    )

    return signature
