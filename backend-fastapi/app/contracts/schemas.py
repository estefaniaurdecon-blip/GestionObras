from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.contracts.models import (
    ApprovalStatus,
    ContractDepartment,
    ContractDocumentType,
    ContractStatus,
    ContractType,
    SignatureStatus,
)


class ContractCreate(BaseModel):
    type: ContractType
    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    comparative_data: Optional[dict] = None
    contract_data: Optional[dict] = None


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    type: Optional[ContractType] = None

    supplier_name: Optional[str] = None
    supplier_tax_id: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_address: Optional[str] = None
    supplier_city: Optional[str] = None
    supplier_postal_code: Optional[str] = None
    supplier_country: Optional[str] = None
    supplier_contact_name: Optional[str] = None
    supplier_bank_iban: Optional[str] = None
    supplier_bank_bic: Optional[str] = None

    total_amount: Optional[Decimal] = None
    currency: Optional[str] = None

    comparative_data: Optional[dict] = None
    contract_data: Optional[dict] = None


class ContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    created_by_id: int
    project_id: Optional[int]
    type: ContractType
    status: ContractStatus
    title: Optional[str]
    description: Optional[str]
    selected_offer_id: Optional[int]

    supplier_name: Optional[str]
    supplier_tax_id: Optional[str]
    supplier_email: Optional[str]
    supplier_phone: Optional[str]
    supplier_address: Optional[str]
    supplier_city: Optional[str]
    supplier_postal_code: Optional[str]
    supplier_country: Optional[str]
    supplier_contact_name: Optional[str]
    supplier_bank_iban: Optional[str]
    supplier_bank_bic: Optional[str]

    total_amount: Optional[Decimal]
    currency: Optional[str]

    comparative_data: Optional[dict]
    contract_data: Optional[dict]
    ocr_data: Optional[dict]

    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
    signed_at: Optional[datetime]

    rejected_reason: Optional[str]
    rejected_by_id: Optional[int]
    rejected_at: Optional[datetime]
    rejected_to_status: Optional[ContractStatus]


class ContractOfferCreate(BaseModel):
    supplier_name: Optional[str] = None
    supplier_tax_id: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None
    total_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    notes: Optional[str] = None


class ContractOfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    created_by_id: int
    supplier_name: Optional[str]
    supplier_tax_id: Optional[str]
    supplier_email: Optional[str]
    supplier_phone: Optional[str]
    total_amount: Optional[Decimal]
    currency: Optional[str]
    notes: Optional[str]
    file_path: Optional[str]
    original_filename: Optional[str]
    created_at: datetime


class ContractApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    department: ContractDepartment
    status: ApprovalStatus
    decided_by_id: Optional[int]
    decided_at: Optional[datetime]
    comment: Optional[str]


class ContractDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    doc_type: ContractDocumentType
    path: str
    created_by_id: Optional[int]
    created_at: datetime


class SelectOfferRequest(BaseModel):
    offer_id: int


class ApprovalDecision(BaseModel):
    comment: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str
    back_to_status: Optional[ContractStatus] = None


class SignatureRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    token: str
    recipient_email: Optional[str]
    expires_at: datetime
    status: SignatureStatus
    sent_at: datetime
    signed_at: Optional[datetime]
