from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.contracts.models import Contract, ContractDocumentType
from app.storage.local import build_contract_document_path


REQUIRED_SUPPLIER_FIELDS = [
    "supplier_name",
    "supplier_tax_id",
    "supplier_email",
    "supplier_address",
]


def supplier_data_complete(contract: Contract) -> bool:
    for field in REQUIRED_SUPPLIER_FIELDS:
        value = getattr(contract, field, None)
        if not value:
            return False
    return True


def _render_comparative(contract: Contract) -> str:
    payload = contract.comparative_data or {}
    return (
        "COMPARATIVO DE OFERTAS\n"
        f"Contrato: {contract.id}\n"
        f"Tipo: {contract.type}\n"
        f"Generado: {datetime.utcnow().isoformat()}\n\n"
        "Datos:\n"
        f"{payload}\n"
    )


def _render_contract(contract: Contract) -> str:
    payload = contract.contract_data or {}
    return (
        "CONTRATO\n"
        f"Contrato: {contract.id}\n"
        f"Proveedor: {contract.supplier_name}\n"
        f"CIF/NIF: {contract.supplier_tax_id}\n"
        f"Generado: {datetime.utcnow().isoformat()}\n\n"
        "Datos:\n"
        f"{payload}\n"
    )


def generate_comparative(contract: Contract) -> Path:
    content = _render_comparative(contract)
    path = build_contract_document_path(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.COMPARATIVE,
        filename="comparative.txt",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def generate_contract(contract: Contract) -> Path | None:
    if not supplier_data_complete(contract):
        return None
    content = _render_contract(contract)
    path = build_contract_document_path(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.CONTRACT,
        filename="contract.txt",
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
