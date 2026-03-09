from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.company_portfolio import (
    CompanyPortfolioCreate,
    CompanyPortfolioRead,
    CompanyPortfolioUpdate,
    CompanyTypeCreate,
    CompanyTypeRead,
    CompanyTypeRename,
)
from app.services.company_portfolio_service import (
    create_company_portfolio_item,
    create_company_type,
    delete_company_portfolio_item,
    delete_company_type,
    list_company_portfolio,
    list_company_types,
    rename_company_type,
    update_company_portfolio_item,
)


router = APIRouter()


def _tenant_scope(current_user: User, x_tenant_id: Optional[int]) -> int:
    if current_user.is_super_admin:
        tenant_id = x_tenant_id or current_user.tenant_id
    else:
        tenant_id = current_user.tenant_id
        if (
            x_tenant_id is not None
            and tenant_id is not None
            and int(x_tenant_id) != int(tenant_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para ese tenant.",
            )
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
    return int(tenant_id)


@router.get("/company-types", response_model=list[CompanyTypeRead], summary="Listar tipos de empresa")
def api_list_company_types(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[CompanyTypeRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_company_types(session, tenant_id=tenant_id)


@router.post(
    "/company-types",
    response_model=CompanyTypeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear tipo de empresa",
)
def api_create_company_type(
    payload: CompanyTypeCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> CompanyTypeRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return create_company_type(
            session,
            tenant_id=tenant_id,
            current_user=current_user,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/company-types/{type_name}", response_model=CompanyTypeRead, summary="Renombrar tipo de empresa")
def api_rename_company_type(
    type_name: str,
    payload: CompanyTypeRename,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> CompanyTypeRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return rename_company_type(
            session,
            tenant_id=tenant_id,
            current_user=current_user,
            type_name=type_name,
            new_type_name=payload.new_type_name,
        )
    except ValueError as exc:
        status_code = status.HTTP_404_NOT_FOUND if "no encontrado" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.delete("/company-types/{type_name}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def api_delete_company_type(
    type_name: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_company_type(session, tenant_id=tenant_id, type_name=type_name)
    except RuntimeError as exc:
        if str(exc) == "TYPE_IN_USE":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="TYPE_IN_USE") from exc
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/company-portfolio", response_model=list[CompanyPortfolioRead], summary="Listar cartera de empresas")
def api_list_company_portfolio(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permissions(["erp:read", "erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[CompanyPortfolioRead]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_company_portfolio(session, tenant_id=tenant_id)


@router.post(
    "/company-portfolio",
    response_model=CompanyPortfolioRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear empresa en cartera",
)
def api_create_company_portfolio_item(
    payload: CompanyPortfolioCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> CompanyPortfolioRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return create_company_portfolio_item(
        session,
        tenant_id=tenant_id,
        current_user=current_user,
        payload=payload,
    )


@router.patch("/company-portfolio/{company_id}", response_model=CompanyPortfolioRead, summary="Actualizar empresa")
def api_update_company_portfolio_item(
    company_id: int,
    payload: CompanyPortfolioUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> CompanyPortfolioRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return update_company_portfolio_item(
            session,
            tenant_id=tenant_id,
            company_id=company_id,
            current_user=current_user,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/company-portfolio/{company_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def api_delete_company_portfolio_item(
    company_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["erp:manage"])),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_company_portfolio_item(
            session,
            tenant_id=tenant_id,
            company_id=company_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

