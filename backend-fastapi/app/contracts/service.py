from __future__ import annotations

from datetime import datetime, timedelta
import io
import re
import secrets
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import text
from sqlmodel import Session, select

import pdfplumber
from pdf2image import convert_from_path
from PIL import Image

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
    Supplier,
    SupplierInvitation,
    SupplierStatus,
    SignatureRequest,
    SignatureStatus,
)
from app.ai.client import OllamaClient, build_extraction_meta, _looks_like_customer, _find_supplier_name_in_header
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
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
from app.core.email import _send_email
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


def _normalize_tax_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    return cleaned or None


def _get_provider_by_tax_id(session: Session, *, tax_id: Optional[str]) -> Optional[dict]:
    normalized = _normalize_tax_id(tax_id)
    if not normalized:
        return None
    stmt = text(
        """
        SELECT
            'subcontratacion' AS source,
            razon_social,
            empresa,
            cif,
            nombre_gerente,
            direccion_empresa,
            telefono_contacto,
            email_contacto
        FROM proveedores_subcontratacion
        WHERE UPPER(cif) = :cif
        UNION ALL
        SELECT
            'suministros' AS source,
            razon_social,
            empresa,
            cif,
            nombre_gerente,
            direccion_empresa,
            NULL AS telefono_contacto,
            NULL AS email_contacto
        FROM proveedores_suministros_servicios
        WHERE UPPER(cif) = :cif
        LIMIT 1
        """
    )
    row = session.exec(stmt, {"cif": normalized}).first()
    if not row:
        return None
    return dict(row._mapping)


def _build_supplier_from_provider(*, tenant_id: int, provider: dict) -> Supplier:
    return Supplier(
        id=0,
        tenant_id=tenant_id,
        tax_id=provider.get("cif") or "",
        name=provider.get("razon_social") or provider.get("empresa"),
        email=provider.get("email_contacto"),
        phone=provider.get("telefono_contacto"),
        address=provider.get("direccion_empresa"),
        contact_name=provider.get("nombre_gerente"),
        status=SupplierStatus.ACTIVE,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


def _get_supplier_by_tax_id(
    session: Session, *, tenant_id: int, tax_id: Optional[str]
) -> Optional[Supplier]:
    normalized = _normalize_tax_id(tax_id)
    if not normalized:
        return None
    return session.exec(
        select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            Supplier.tax_id == normalized,
        )
    ).one_or_none()


def _sync_contract_from_supplier(contract: Contract, supplier: Supplier) -> None:
    if supplier.name and not contract.supplier_name:
        contract.supplier_name = supplier.name
    if supplier.tax_id and not contract.supplier_tax_id:
        contract.supplier_tax_id = supplier.tax_id
    if supplier.email and not contract.supplier_email:
        contract.supplier_email = supplier.email
    if supplier.phone and not contract.supplier_phone:
        contract.supplier_phone = supplier.phone
    if supplier.address and not contract.supplier_address:
        contract.supplier_address = supplier.address
    if supplier.city and not contract.supplier_city:
        contract.supplier_city = supplier.city
    if supplier.postal_code and not contract.supplier_postal_code:
        contract.supplier_postal_code = supplier.postal_code
    if supplier.country and not contract.supplier_country:
        contract.supplier_country = supplier.country
    if supplier.contact_name and not contract.supplier_contact_name:
        contract.supplier_contact_name = supplier.contact_name
    if supplier.bank_iban and not contract.supplier_bank_iban:
        contract.supplier_bank_iban = supplier.bank_iban
    if supplier.bank_bic and not contract.supplier_bank_bic:
        contract.supplier_bank_bic = supplier.bank_bic


def _sync_contract_from_provider(contract: Contract, provider: dict) -> None:
    if not contract.supplier_name:
        contract.supplier_name = provider.get("razon_social") or provider.get("empresa")
    if not contract.supplier_tax_id:
        contract.supplier_tax_id = provider.get("cif")
    if not contract.supplier_email:
        contract.supplier_email = provider.get("email_contacto")
    if not contract.supplier_phone:
        contract.supplier_phone = provider.get("telefono_contacto")
    if not contract.supplier_address:
        contract.supplier_address = provider.get("direccion_empresa")
    if not contract.supplier_contact_name:
        contract.supplier_contact_name = provider.get("nombre_gerente")


def _create_supplier_invitation(
    session: Session,
    *,
    supplier: Supplier,
    contract: Optional[Contract],
    email: Optional[str],
) -> Optional[SupplierInvitation]:
    if not email:
        return None
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    invitation = SupplierInvitation(
        tenant_id=supplier.tenant_id,
        supplier_id=supplier.id,  # type: ignore[arg-type]
        contract_id=contract.id if contract else None,
        email=email,
        token=token,
        created_at=now,
        expires_at=now + timedelta(days=14),
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    frontend_url = settings.frontend_base_url
    if frontend_url:
        onboarding_url = f"{frontend_url.rstrip('/')}/supplier-onboarding?token={token}"
        body = (
            "Por favor completa los datos del proveedor en el siguiente enlace:\n"
            f"{onboarding_url}\n"
        )
        _send_email([email], "Completar datos de proveedor", body)

    return invitation


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
                    ContractStatus.PENDING_SUPPLIER,
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
        if field == "supplier_tax_id":
            value = _normalize_tax_id(value)
        setattr(contract, field, value)

    supplier = None
    if "supplier_tax_id" in payload or contract.supplier_tax_id:
        supplier = _get_supplier_by_tax_id(
            session,
            tenant_id=tenant_id,
            tax_id=contract.supplier_tax_id,
        )
        if supplier:
            contract.supplier_id = supplier.id
            _sync_contract_from_supplier(contract, supplier)
        elif contract.supplier_tax_id:
            provider = _get_provider_by_tax_id(session, tax_id=contract.supplier_tax_id)
            if provider:
                _sync_contract_from_provider(contract, provider)
            supplier = Supplier(
                tenant_id=tenant_id,
                created_by_id=user.id,
                tax_id=contract.supplier_tax_id,
                name=contract.supplier_name,
                email=contract.supplier_email,
                phone=contract.supplier_phone,
                address=contract.supplier_address,
                city=contract.supplier_city,
                postal_code=contract.supplier_postal_code,
                country=contract.supplier_country,
                contact_name=contract.supplier_contact_name,
                bank_iban=contract.supplier_bank_iban,
                bank_bic=contract.supplier_bank_bic,
                status=SupplierStatus.PENDING,
                updated_at=datetime.utcnow(),
            )
            session.add(supplier)
            session.commit()
            session.refresh(supplier)
            contract.supplier_id = supplier.id
            _create_supplier_invitation(
                session,
                supplier=supplier,
                contract=contract,
                email=contract.supplier_email,
            )

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

    _extract_and_apply_offer_data(session=session, offer=offer)

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

    contract.status = (
        ContractStatus.PENDING_JEFE_OBRA
        if supplier_data_complete(contract)
        else ContractStatus.PENDING_SUPPLIER
    )
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
    if contract.status == ContractStatus.PENDING_SUPPLIER:
        supplier = None
        if contract.supplier_id:
            supplier = session.get(Supplier, contract.supplier_id)
        if not supplier and contract.supplier_tax_id:
            supplier = Supplier(
                tenant_id=tenant_id,
                created_by_id=user.id,
                tax_id=contract.supplier_tax_id,
                name=contract.supplier_name,
                email=contract.supplier_email,
                phone=contract.supplier_phone,
                address=contract.supplier_address,
                city=contract.supplier_city,
                postal_code=contract.supplier_postal_code,
                country=contract.supplier_country,
                contact_name=contract.supplier_contact_name,
                bank_iban=contract.supplier_bank_iban,
                bank_bic=contract.supplier_bank_bic,
                status=SupplierStatus.PENDING,
                updated_at=datetime.utcnow(),
            )
            session.add(supplier)
            session.commit()
            session.refresh(supplier)
            contract.supplier_id = supplier.id
            session.add(contract)
            session.commit()

        supplier_email = contract.supplier_email or (supplier.email if supplier else None)
        if supplier and supplier_email:
            _create_supplier_invitation(
                session,
                supplier=supplier,
                contract=contract,
                email=supplier_email,
            )
        send_contract_notification.delay(
            event=ContractNotificationEvent.SUPPLIER_PENDING,
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
            department_label="Gerencia",
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

        send_contract_notification.delay(
            event=ContractNotificationEvent.DEPT_APPROVED,
            contract_id=contract.id,
            department_label=dept.value,
        )
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

    contract.status = back_to_status or ContractStatus.REJECTED
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


def lookup_supplier(
    session: Session,
    *,
    tenant_id: int,
    tax_id: str,
) -> Optional[Supplier]:
    supplier = _get_supplier_by_tax_id(session, tenant_id=tenant_id, tax_id=tax_id)
    if supplier:
        return supplier
    provider = _get_provider_by_tax_id(session, tax_id=tax_id)
    if not provider:
        return None
    return _build_supplier_from_provider(tenant_id=tenant_id, provider=provider)


def _image_bytes_from_pil(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _extract_text_from_pdf(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        texts = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(texts).strip()


def _ocr_pdf(path: str, client: OllamaClient, dpi: int = 200) -> str:
    pages = convert_from_path(path, dpi=dpi)
    ocr_texts = []
    for page in pages:
        ocr_texts.append(client.ocr_image_to_text(_image_bytes_from_pil(page)))
    return "\n".join(ocr_texts).strip()


def _ocr_image(path: str, client: OllamaClient) -> str:
    with Image.open(path) as img:
        return client.ocr_image_to_text(_image_bytes_from_pil(img))


def _find_first_email(text: str) -> Optional[str]:
    match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    return match.group(0) if match else None


def _find_first_phone(text: str) -> Optional[str]:
    match = re.search(r"(?:\+?\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,12}\d", text)
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(0)).strip()


def _extract_offer_from_file(path: str) -> dict:
    client = OllamaClient()
    path_lower = path.lower()
    is_image = path_lower.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp"))
    if is_image:
        text = _ocr_image(path, client)
    else:
        text = _extract_text_from_pdf(path)
        if len(text) < 40:
            text = _ocr_pdf(path, client)

    raw_json = client.invoice_text_to_json(text)
    normalized = raw_json

    if not is_image and _looks_like_customer(normalized.get("supplier_name")):
        header_guess = _find_supplier_name_in_header(text)
        if header_guess:
            normalized["supplier_name"] = header_guess

    normalized["supplier_email"] = _find_first_email(text)
    normalized["supplier_phone"] = _find_first_phone(text)

    return {
        "text": text,
        "raw_json": raw_json,
        "normalized": normalized,
    }


def _extract_and_apply_offer_data(*, session: Session, offer: ContractOffer) -> None:
    if not offer.file_path:
        return

    try:
        extraction = _extract_offer_from_file(offer.file_path)
        normalized = extraction["normalized"] or {}
        offer.extracted_text = extraction.get("text")
        offer.extraction_raw_json = extraction.get("raw_json")
        meta = build_extraction_meta()
        meta["status"] = "success"
        meta["finished_at"] = datetime.utcnow().isoformat()
        offer.extraction_meta = meta

        if not offer.supplier_name and normalized.get("supplier_name"):
            offer.supplier_name = normalized.get("supplier_name")
        if not offer.supplier_tax_id and normalized.get("supplier_tax_id"):
            offer.supplier_tax_id = normalized.get("supplier_tax_id")
        if not offer.supplier_email and normalized.get("supplier_email"):
            offer.supplier_email = normalized.get("supplier_email")
        if not offer.supplier_phone and normalized.get("supplier_phone"):
            offer.supplier_phone = normalized.get("supplier_phone")
        if not offer.total_amount and normalized.get("total_amount") is not None:
            offer.total_amount = normalized.get("total_amount")
        if not offer.currency and normalized.get("currency"):
            offer.currency = normalized.get("currency")

        if offer.supplier_tax_id:
            provider = _get_provider_by_tax_id(session, tax_id=offer.supplier_tax_id)
            if provider:
                if not offer.supplier_name:
                    offer.supplier_name = provider.get("razon_social") or provider.get("empresa")
                if not offer.supplier_email:
                    offer.supplier_email = provider.get("email_contacto")
                if not offer.supplier_phone:
                    offer.supplier_phone = provider.get("telefono_contacto")

        session.add(offer)
        session.commit()
        session.refresh(offer)
    except (AIUnavailableError, AIInvalidResponseError) as exc:
        offer.extraction_meta = {
            "status": "failed",
            "reason": str(exc),
            "finished_at": datetime.utcnow().isoformat(),
        }
        session.add(offer)
        session.commit()
    except Exception as exc:
        offer.extraction_meta = {
            "status": "failed",
            "reason": str(exc),
            "finished_at": datetime.utcnow().isoformat(),
        }
        session.add(offer)
        session.commit()


def validate_supplier_onboarding(
    session: Session,
    *,
    token: str,
) -> SupplierInvitation:
    invitation = session.exec(
        select(SupplierInvitation).where(SupplierInvitation.token == token),
    ).one_or_none()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido.")
    if invitation.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitacion ya utilizada.")
    if invitation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitacion caducada.")
    return invitation


def submit_supplier_onboarding(
    session: Session,
    *,
    token: str,
    payload: dict,
) -> Supplier:
    invitation = validate_supplier_onboarding(session, token=token)
    supplier = session.get(Supplier, invitation.supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado.")

    for key, value in payload.items():
        if value is None:
            continue
        if hasattr(supplier, key):
            setattr(supplier, key, value)

    supplier.status = SupplierStatus.ACTIVE
    supplier.updated_at = datetime.utcnow()
    session.add(supplier)

    invitation.used_at = datetime.utcnow()
    session.add(invitation)
    session.commit()
    session.refresh(supplier)

    if invitation.contract_id:
        contract = session.get(Contract, invitation.contract_id)
        if contract and contract.tenant_id == supplier.tenant_id:
            contract.supplier_id = supplier.id
            _sync_contract_from_supplier(contract, supplier)
            if contract.status == ContractStatus.PENDING_SUPPLIER:
                contract.status = ContractStatus.PENDING_JEFE_OBRA
            contract.updated_at = datetime.utcnow()
            session.add(contract)
            session.commit()

            create_documents_for_contract(
                session,
                contract=contract,
                created_by_id=None,
            )

            _log_event(
                session,
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                user_id=None,
                event_type="contract.supplier_completed",
            )
            send_contract_notification.delay(
                event=ContractNotificationEvent.SUPPLIER_COMPLETED,
                contract_id=contract.id,
            )

    return supplier


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
