from __future__ import annotations

from datetime import datetime
from app.core.datetime import utc_now
from typing import Optional

from sqlmodel import Session, select

from app.models.company_portfolio import CompanyPortfolio, CompanyType
from app.models.user import User
from app.schemas.company_portfolio import (
    CompanyPortfolioCreate,
    CompanyPortfolioRead,
    CompanyPortfolioUpdate,
    CompanyTypeCreate,
    CompanyTypeRead,
)


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_type_list(values: list[str]) -> list[str]:
    cleaned = [_normalize_optional_text(value) for value in values]
    deduped: list[str] = []
    seen: set[str] = set()
    for item in cleaned:
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _company_to_read(
    row: CompanyPortfolio,
    *,
    creator_name: Optional[str] = None,
    editor_name: Optional[str] = None,
) -> CompanyPortfolioRead:
    return CompanyPortfolioRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        company_name=row.company_name,
        company_type=list(row.company_type or []),
        contact_person=row.contact_person,
        contact_phone=row.contact_phone,
        contact_email=row.contact_email,
        address=row.address,
        city=row.city,
        postal_code=row.postal_code,
        country=row.country,
        fiscal_id=row.fiscal_id,
        notes=row.notes,
        created_by_id=row.created_by_id,
        updated_by_id=row.updated_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        creator_name=creator_name,
        editor_name=editor_name,
    )


def _company_type_to_read(row: CompanyType) -> CompanyTypeRead:
    return CompanyTypeRead(
        id=int(row.id or 0),
        tenant_id=row.tenant_id,
        type_name=row.type_name,
        created_by_id=row.created_by_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_company_types(session: Session, *, tenant_id: int) -> list[CompanyTypeRead]:
    rows = session.exec(
        select(CompanyType)
        .where(CompanyType.tenant_id == tenant_id)
        .order_by(CompanyType.type_name.asc())
    ).all()
    return [_company_type_to_read(row) for row in rows]


def create_company_type(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    payload: CompanyTypeCreate,
) -> CompanyTypeRead:
    normalized_name = payload.type_name.strip()
    if not normalized_name:
        raise ValueError("Nombre de tipo invalido.")

    exists = session.exec(
        select(CompanyType).where(
            CompanyType.tenant_id == tenant_id,
            CompanyType.type_name == normalized_name,
        )
    ).first()
    if exists:
        raise ValueError("El tipo ya existe.")

    row = CompanyType(
        tenant_id=tenant_id,
        type_name=normalized_name,
        created_by_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _company_type_to_read(row)


def rename_company_type(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    type_name: str,
    new_type_name: str,
) -> CompanyTypeRead:
    normalized_old = type_name.strip()
    normalized_new = new_type_name.strip()
    if not normalized_old or not normalized_new:
        raise ValueError("Nombre de tipo invalido.")

    row = session.exec(
        select(CompanyType).where(
            CompanyType.tenant_id == tenant_id,
            CompanyType.type_name == normalized_old,
        )
    ).first()
    if not row:
        raise ValueError("Tipo no encontrado.")

    duplicate = session.exec(
        select(CompanyType).where(
            CompanyType.tenant_id == tenant_id,
            CompanyType.type_name == normalized_new,
            CompanyType.id != row.id,
        )
    ).first()
    if duplicate:
        raise ValueError("El nuevo nombre ya existe.")

    row.type_name = normalized_new
    row.updated_at = utc_now()
    session.add(row)

    companies = session.exec(
        select(CompanyPortfolio).where(CompanyPortfolio.tenant_id == tenant_id)
    ).all()
    for company in companies:
        normalized_types = _normalize_type_list(
            [normalized_new if item == normalized_old else item for item in list(company.company_type or [])]
        )
        if normalized_types != list(company.company_type or []):
            company.company_type = normalized_types
            company.updated_at = utc_now()
            company.updated_by_id = current_user.id
            session.add(company)

    session.commit()
    session.refresh(row)
    return _company_type_to_read(row)


def delete_company_type(
    session: Session,
    *,
    tenant_id: int,
    type_name: str,
) -> None:
    normalized_name = type_name.strip()
    row = session.exec(
        select(CompanyType).where(
            CompanyType.tenant_id == tenant_id,
            CompanyType.type_name == normalized_name,
        )
    ).first()
    if not row:
        raise ValueError("Tipo no encontrado.")

    companies = session.exec(
        select(CompanyPortfolio).where(CompanyPortfolio.tenant_id == tenant_id)
    ).all()
    is_in_use = any(normalized_name in list(company.company_type or []) for company in companies)
    if is_in_use:
        raise RuntimeError("TYPE_IN_USE")

    session.delete(row)
    session.commit()


def list_company_portfolio(session: Session, *, tenant_id: int) -> list[CompanyPortfolioRead]:
    rows = session.exec(
        select(CompanyPortfolio)
        .where(CompanyPortfolio.tenant_id == tenant_id)
        .order_by(CompanyPortfolio.company_name.asc())
    ).all()
    if not rows:
        return []

    user_ids = {
        int(user_id)
        for row in rows
        for user_id in (row.created_by_id, row.updated_by_id)
        if user_id is not None
    }
    users_by_id: dict[int, User] = {}
    if user_ids:
        users = session.exec(select(User).where(User.id.in_(user_ids))).all()
        users_by_id = {int(user.id or 0): user for user in users if user.id is not None}

    result: list[CompanyPortfolioRead] = []
    for row in rows:
        creator_name = users_by_id.get(int(row.created_by_id or 0)).full_name if row.created_by_id else None
        editor_name = users_by_id.get(int(row.updated_by_id or 0)).full_name if row.updated_by_id else None
        result.append(
            _company_to_read(
                row,
                creator_name=creator_name,
                editor_name=editor_name,
            )
        )
    return result


def create_company_portfolio_item(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    payload: CompanyPortfolioCreate,
) -> CompanyPortfolioRead:
    row = CompanyPortfolio(
        tenant_id=tenant_id,
        company_name=payload.company_name.strip(),
        company_type=_normalize_type_list(payload.company_type or []),
        contact_person=_normalize_optional_text(payload.contact_person),
        contact_phone=_normalize_optional_text(payload.contact_phone),
        contact_email=_normalize_optional_text(payload.contact_email),
        address=_normalize_optional_text(payload.address),
        city=_normalize_optional_text(payload.city),
        postal_code=_normalize_optional_text(payload.postal_code),
        country=_normalize_optional_text(payload.country),
        fiscal_id=_normalize_optional_text(payload.fiscal_id),
        notes=_normalize_optional_text(payload.notes),
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _company_to_read(row, creator_name=current_user.full_name, editor_name=current_user.full_name)


def update_company_portfolio_item(
    session: Session,
    *,
    tenant_id: int,
    company_id: int,
    current_user: User,
    payload: CompanyPortfolioUpdate,
) -> CompanyPortfolioRead:
    row = session.exec(
        select(CompanyPortfolio).where(
            CompanyPortfolio.id == company_id,
            CompanyPortfolio.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise ValueError("Empresa no encontrada.")

    if payload.company_name is not None:
        row.company_name = payload.company_name.strip()
    if payload.company_type is not None:
        row.company_type = _normalize_type_list(payload.company_type or [])
    if payload.contact_person is not None:
        row.contact_person = _normalize_optional_text(payload.contact_person)
    if payload.contact_phone is not None:
        row.contact_phone = _normalize_optional_text(payload.contact_phone)
    if payload.contact_email is not None:
        row.contact_email = _normalize_optional_text(payload.contact_email)
    if payload.address is not None:
        row.address = _normalize_optional_text(payload.address)
    if payload.city is not None:
        row.city = _normalize_optional_text(payload.city)
    if payload.postal_code is not None:
        row.postal_code = _normalize_optional_text(payload.postal_code)
    if payload.country is not None:
        row.country = _normalize_optional_text(payload.country)
    if payload.fiscal_id is not None:
        row.fiscal_id = _normalize_optional_text(payload.fiscal_id)
    if payload.notes is not None:
        row.notes = _normalize_optional_text(payload.notes)

    row.updated_by_id = current_user.id
    row.updated_at = utc_now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _company_to_read(row, editor_name=current_user.full_name)


def delete_company_portfolio_item(
    session: Session,
    *,
    tenant_id: int,
    company_id: int,
) -> None:
    row = session.exec(
        select(CompanyPortfolio).where(
            CompanyPortfolio.id == company_id,
            CompanyPortfolio.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise ValueError("Empresa no encontrada.")
    session.delete(row)
    session.commit()

