from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status, Request
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.contracts.models import ContractStatus
from app.contracts.schemas import (
    ApprovalDecision,
    ContractCreate,
    ContractOfferCreate,
    ContractOfferRead,
    ContractRead,
    ContractUpdate,
    RejectRequest,
    SelectOfferRequest,
    SignatureRequestRead,
)
from app.contracts.service import (
    add_offer,
    approve_contract,
    create_contract,
    generate_docs,
    get_contract,
    list_contracts,
    reject_contract,
    select_offer,
    sign_contract_by_token,
    submit_gerencia,
    update_contract,
)
from app.models.user import User


router = APIRouter()
public_router = APIRouter()


def _tenant_for_write(current_user: User, x_tenant_id: Optional[int]) -> int:
    if current_user.is_super_admin:
        if x_tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-Id requerido para super admin.",
            )
        return x_tenant_id
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario no tiene tenant asociado.",
        )
    return current_user.tenant_id


@router.post("", response_model=ContractRead)
def create_contract_endpoint(
    payload: ContractCreate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = create_contract(
        session=session,
        tenant_id=tenant_id,
        created_by=current_user,
        payload=payload.model_dump(),
    )
    return ContractRead.model_validate(contract)


@router.get("", response_model=list[ContractRead])
def list_contracts_endpoint(
    status_filter: Optional[ContractStatus] = None,
    pending_only: bool = False,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractRead]:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contracts = list_contracts(
        session=session,
        tenant_id=tenant_id,
        current_user=current_user,
        status_filter=status_filter,
        pending_only=pending_only,
    )
    return [ContractRead.model_validate(item) for item in contracts]


@router.get("/{contract_id}", response_model=ContractRead)
def get_contract_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = get_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return ContractRead.model_validate(contract)


@router.patch("/{contract_id}", response_model=ContractRead)
def update_contract_endpoint(
    contract_id: int,
    payload: ContractUpdate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = update_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload.model_dump(exclude_unset=True),
        user=current_user,
    )
    return ContractRead.model_validate(contract)


@router.post("/{contract_id}/offers", response_model=ContractOfferRead)
def add_offer_endpoint(
    contract_id: int,
    file: UploadFile = File(...),
    supplier_name: Optional[str] = Form(default=None),
    supplier_tax_id: Optional[str] = Form(default=None),
    supplier_email: Optional[str] = Form(default=None),
    supplier_phone: Optional[str] = Form(default=None),
    total_amount: Optional[float] = Form(default=None),
    currency: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractOfferRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    payload = ContractOfferCreate(
        supplier_name=supplier_name,
        supplier_tax_id=supplier_tax_id,
        supplier_email=supplier_email,
        supplier_phone=supplier_phone,
        total_amount=total_amount,
        currency=currency,
        notes=notes,
    ).model_dump()
    offer = add_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        upload=file,
        user=current_user,
    )
    return ContractOfferRead.model_validate(offer)


@router.post("/{contract_id}/select-offer", response_model=ContractRead)
def select_offer_endpoint(
    contract_id: int,
    payload: SelectOfferRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = select_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        offer_id=payload.offer_id,
        user=current_user,
    )
    return ContractRead.model_validate(contract)


@router.post("/{contract_id}/generate-docs", response_model=ContractRead)
def generate_docs_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = generate_docs(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return ContractRead.model_validate(contract)


@router.post("/{contract_id}/submit-gerencia", response_model=ContractRead)
def submit_gerencia_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = submit_gerencia(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return ContractRead.model_validate(contract)


@router.post("/{contract_id}/approve", response_model=ContractRead)
def approve_contract_endpoint(
    contract_id: int,
    payload: ApprovalDecision,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = approve_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        comment=payload.comment,
    )
    return ContractRead.model_validate(contract)


@router.post("/{contract_id}/reject", response_model=ContractRead)
def reject_contract_endpoint(
    contract_id: int,
    payload: RejectRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    contract = reject_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        reason=payload.reason,
        back_to_status=payload.back_to_status,
    )
    return ContractRead.model_validate(contract)


@public_router.post("/sign/{token}", response_model=SignatureRequestRead)
def sign_contract_public(
    token: str,
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    session: Session = Depends(get_session),
) -> SignatureRequestRead:
    signature = sign_contract_by_token(
        session=session,
        token=token,
        upload=file,
        signer_ip=request.client.host if request.client else None,
    )
    return SignatureRequestRead.model_validate(signature)
