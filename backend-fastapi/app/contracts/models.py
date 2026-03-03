from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Index, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class ContractType(str, Enum):
    SUMINISTRO = "SUMINISTRO"
    SERVICIO = "SERVICIO"
    SUBCONTRATACION = "SUBCONTRATACION"


class ContractStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_SUPPLIER = "PENDING_SUPPLIER"
    PENDING_JEFE_OBRA = "PENDING_JEFE_OBRA"
    PENDING_GERENCIA = "PENDING_GERENCIA"
    PENDING_ADMIN = "PENDING_ADMIN"
    PENDING_COMPRAS = "PENDING_COMPRAS"
    PENDING_JURIDICO = "PENDING_JURIDICO"
    IN_SIGNATURE = "IN_SIGNATURE"
    SIGNED = "SIGNED"
    REJECTED = "REJECTED"


class ContractDocumentType(str, Enum):
    COMPARATIVE = "COMPARATIVE"
    CONTRACT = "CONTRACT"
    SIGNED = "SIGNED"


class ContractDepartment(str, Enum):
    GERENCIA = "GERENCIA"
    ADMIN = "ADMIN"
    COMPRAS = "COMPRAS"
    JURIDICO = "JURIDICO"


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SignatureStatus(str, Enum):
    SENT = "SENT"
    SIGNED = "SIGNED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class ContractNotificationEvent(str, Enum):
    DOCS_GENERATED = "DOCS_GENERATED"
    SUPPLIER_PENDING = "SUPPLIER_PENDING"
    SUPPLIER_COMPLETED = "SUPPLIER_COMPLETED"
    GERENCIA_PENDING = "GERENCIA_PENDING"
    GERENCIA_APPROVED = "GERENCIA_APPROVED"
    DEPT_APPROVED = "DEPT_APPROVED"
    ALL_APPROVED = "ALL_APPROVED"
    SIGNATURE_SENT = "SIGNATURE_SENT"
    SIGNED = "SIGNED"
    REJECTED = "REJECTED"


class Contract(SQLModel, table=True):
    __tablename__ = "contract"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id", index=True)

    type: ContractType = Field(index=True)
    status: ContractStatus = Field(default=ContractStatus.DRAFT, index=True)

    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))

    selected_offer_id: Optional[int] = Field(default=None, foreign_key="contract_offer.id", index=True)

    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_tax_id: Optional[str] = Field(default=None, max_length=64)
    supplier_email: Optional[str] = Field(default=None, max_length=255)
    supplier_phone: Optional[str] = Field(default=None, max_length=64)
    supplier_address: Optional[str] = Field(default=None, max_length=255)
    supplier_city: Optional[str] = Field(default=None, max_length=128)
    supplier_postal_code: Optional[str] = Field(default=None, max_length=32)
    supplier_country: Optional[str] = Field(default=None, max_length=64)
    supplier_contact_name: Optional[str] = Field(default=None, max_length=255)
    supplier_bank_iban: Optional[str] = Field(default=None, max_length=64)
    supplier_bank_bic: Optional[str] = Field(default=None, max_length=32)
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id", index=True)

    total_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2)))
    currency: Optional[str] = Field(default=None, max_length=16)

    comparative_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    contract_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    ocr_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    submitted_at: Optional[datetime] = Field(default=None)
    approved_at: Optional[datetime] = Field(default=None)
    signed_at: Optional[datetime] = Field(default=None)

    rejected_reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    rejected_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    rejected_at: Optional[datetime] = Field(default=None)
    rejected_to_status: Optional[ContractStatus] = Field(default=None)

    __table_args__ = (
        Index("ix_contract_tenant_status", "tenant_id", "status"),
        Index("ix_contract_tenant_created", "tenant_id", "created_at"),
    )


class ContractOffer(SQLModel, table=True):
    __tablename__ = "contract_offer"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)

    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_tax_id: Optional[str] = Field(default=None, max_length=64)
    supplier_email: Optional[str] = Field(default=None, max_length=255)
    supplier_phone: Optional[str] = Field(default=None, max_length=64)

    total_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2)))
    currency: Optional[str] = Field(default=None, max_length=16)

    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    file_path: Optional[str] = Field(default=None, max_length=512)
    original_filename: Optional[str] = Field(default=None, max_length=255)

    extracted_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    extraction_raw_json: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    extraction_meta: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("ix_contract_offer_tenant_contract", "tenant_id", "contract_id"),
    )


class ContractApproval(SQLModel, table=True):
    __tablename__ = "contract_approval"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)

    department: ContractDepartment = Field(index=True)
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING, index=True)

    decided_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    decided_at: Optional[datetime] = Field(default=None)
    comment: Optional[str] = Field(default=None, sa_column=Column(Text))

    __table_args__ = (
        Index(
            "uq_contract_approval",
            "tenant_id",
            "contract_id",
            "department",
            unique=True,
        ),
    )


class ContractDocument(SQLModel, table=True):
    __tablename__ = "contract_document"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    doc_type: ContractDocumentType = Field(index=True)
    path: str = Field(max_length=512)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("ix_contract_doc_tenant_contract", "tenant_id", "contract_id"),
    )


class SignatureRequest(SQLModel, table=True):
    __tablename__ = "signature_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)

    token: str = Field(index=True, unique=True, max_length=128)
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    expires_at: datetime = Field(index=True)
    status: SignatureStatus = Field(default=SignatureStatus.SENT, index=True)

    sent_at: datetime = Field(default_factory=datetime.utcnow)
    signed_at: Optional[datetime] = Field(default=None)
    signed_ip: Optional[str] = Field(default=None, max_length=64)
    signed_file_path: Optional[str] = Field(default=None, max_length=512)


class ContractEvent(SQLModel, table=True):
    __tablename__ = "contract_event"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    event_type: str = Field(index=True, max_length=64)
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class ContractNotificationLog(SQLModel, table=True):
    __tablename__ = "contract_notification_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    event_type: ContractNotificationEvent = Field(index=True)
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    sent_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index(
            "uq_contract_notification_log",
            "tenant_id",
            "contract_id",
            "event_type",
            "recipient_email",
            unique=True,
        ),
    )


class SupplierStatus(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"


class Supplier(SQLModel, table=True):
    __tablename__ = "supplier"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)

    tax_id: str = Field(max_length=64, index=True)
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=64)
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=64)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    bank_iban: Optional[str] = Field(default=None, max_length=64)
    bank_bic: Optional[str] = Field(default=None, max_length=32)

    status: SupplierStatus = Field(default=SupplierStatus.PENDING, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("uq_supplier_tenant_tax_id", "tenant_id", "tax_id", unique=True),
    )


class SupplierInvitation(SQLModel, table=True):
    __tablename__ = "supplier_invitation"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    supplier_id: int = Field(foreign_key="supplier.id", index=True)
    contract_id: Optional[int] = Field(default=None, foreign_key="contract.id", index=True)

    email: Optional[str] = Field(default=None, max_length=255)
    token: str = Field(index=True, unique=True, max_length=128)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(index=True)
    used_at: Optional[datetime] = Field(default=None)
