from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.models.tenant_branding import TenantBranding
from app.schemas.branding import BrandingRead
from app.services.branding_service import (
    build_palette,
    resolve_branding,
    resolve_logo_path,
    update_branding,
)


router = APIRouter()


def _ensure_tenant_access(current_user: User, tenant_id: int) -> None:
    if current_user.is_super_admin:
        return
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para gestionar este tenant",
        )


@router.get("/{tenant_id}", response_model=BrandingRead)
def get_branding(
    tenant_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> BrandingRead:
    _ensure_tenant_access(current_user, tenant_id)
    accent_color, logo_path = resolve_branding(session, tenant_id)
    branding = session.exec(
        select(TenantBranding).where(TenantBranding.tenant_id == tenant_id),
    ).one_or_none()
    return BrandingRead(
        logo=resolve_logo_path(logo_path),
        color_palette=build_palette(accent_color),
        accent_color=accent_color,
        company_name=branding.company_name if branding else None,
        company_subtitle=branding.company_subtitle if branding else None,
        updated_at=branding.updated_at if branding else None,
    )


@router.put(
    "/{tenant_id}",
    response_model=BrandingRead,
)
def update_branding_endpoint(
    tenant_id: int,
    accent_color: Optional[str] = Form(default=None),
    company_name: Optional[str] = Form(default=None),
    company_subtitle: Optional[str] = Form(default=None),
    logo: Optional[UploadFile] = File(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> BrandingRead:
    _ensure_tenant_access(current_user, tenant_id)
    try:
        branding = update_branding(
            session,
            tenant_id,
            accent_color,
            logo,
            company_name,
            company_subtitle,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return BrandingRead(
        logo=resolve_logo_path(branding.logo_path),
        color_palette=build_palette(branding.accent_color),
        accent_color=branding.accent_color,
        company_name=branding.company_name,
        company_subtitle=branding.company_subtitle,
        updated_at=branding.updated_at,
    )
