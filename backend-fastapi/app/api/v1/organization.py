from datetime import datetime
from pathlib import Path
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.db.session import get_session
from app.models.tenant import Tenant
from app.models.tenant_branding import TenantBranding
from app.models.tenant_profile import TenantProfile
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.organization import (
    OrganizationRead,
    OrganizationUpdate,
    UserPreferenceRead,
    UserPreferenceUpdate,
)
from app.services.branding_service import resolve_logo_path, update_branding


router = APIRouter()

HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
VALID_PLATFORMS = {"all", "windows", "android", "web"}


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _tenant_id_for_user(current_user: User) -> int:
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido para esta operacion.",
        )
    return int(current_user.tenant_id)


def _load_tenant_or_404(session: Session, tenant_id: int) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant no encontrado.",
        )
    return tenant


def _default_invitation_code(tenant: Tenant) -> str:
    return f"{tenant.subdomain}".upper()


def _load_or_create_profile(session: Session, tenant: Tenant) -> TenantProfile:
    profile = session.exec(
        select(TenantProfile).where(TenantProfile.tenant_id == tenant.id),
    ).one_or_none()
    if profile:
        if not profile.invitation_code:
            profile.invitation_code = _default_invitation_code(tenant)
            profile.updated_at = datetime.utcnow()
            session.add(profile)
            session.commit()
            session.refresh(profile)
        return profile

    profile = TenantProfile(
        tenant_id=int(tenant.id),
        invitation_code=_default_invitation_code(tenant),
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def _load_branding(session: Session, tenant_id: int) -> TenantBranding | None:
    return session.exec(
        select(TenantBranding).where(TenantBranding.tenant_id == tenant_id),
    ).one_or_none()


def _count_active_users(session: Session, tenant_id: int) -> int:
    result = session.exec(
        select(func.count())
        .select_from(User)
        .where(User.tenant_id == tenant_id, User.is_active.is_(True)),
    ).one()
    return int(result or 0)


def _to_organization_read(
    session: Session,
    tenant: Tenant,
    profile: TenantProfile,
    branding: TenantBranding | None,
) -> OrganizationRead:
    logo = resolve_logo_path(branding.logo_path) if branding else None
    brand_color = branding.accent_color if branding else settings.default_brand_accent_color

    return OrganizationRead(
        id=str(tenant.id),
        name=tenant.name,
        commercial_name=profile.commercial_name,
        logo=logo,
        subscription_status=profile.subscription_status,
        subscription_end_date=profile.subscription_end_date,
        trial_end_date=profile.trial_end_date,
        updated_at=profile.updated_at,
        invitation_code=profile.invitation_code,
        brand_color=brand_color,
        fiscal_id=profile.fiscal_id,
        legal_name=profile.legal_name,
        email=profile.email,
        phone=profile.phone,
        address=profile.address,
        city=profile.city,
        postal_code=profile.postal_code,
        country=profile.country,
        max_users=profile.max_users,
        current_users=_count_active_users(session, int(tenant.id)),
    )


@router.get("/organization/me", response_model=OrganizationRead)
def get_my_organization(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrganizationRead:
    tenant_id = _tenant_id_for_user(current_user)
    tenant = _load_tenant_or_404(session, tenant_id)
    profile = _load_or_create_profile(session, tenant)
    branding = _load_branding(session, tenant_id)
    return _to_organization_read(session, tenant, profile, branding)


@router.patch("/organization/me", response_model=OrganizationRead)
def update_my_organization(
    payload: OrganizationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrganizationRead:
    tenant_id = _tenant_id_for_user(current_user)
    tenant = _load_tenant_or_404(session, tenant_id)
    profile = _load_or_create_profile(session, tenant)
    branding = _load_branding(session, tenant_id)

    if payload.name is not None:
        tenant.name = _normalize_optional(payload.name) or tenant.name

    if payload.commercial_name is not None:
        profile.commercial_name = _normalize_optional(payload.commercial_name)
    if payload.fiscal_id is not None:
        profile.fiscal_id = _normalize_optional(payload.fiscal_id)
    if payload.legal_name is not None:
        profile.legal_name = _normalize_optional(payload.legal_name)
    if payload.email is not None:
        profile.email = _normalize_optional(payload.email)
    if payload.phone is not None:
        profile.phone = _normalize_optional(payload.phone)
    if payload.address is not None:
        profile.address = _normalize_optional(payload.address)
    if payload.city is not None:
        profile.city = _normalize_optional(payload.city)
    if payload.postal_code is not None:
        profile.postal_code = _normalize_optional(payload.postal_code)
    if payload.country is not None:
        profile.country = _normalize_optional(payload.country) or "Espana"
    if payload.subscription_status is not None:
        profile.subscription_status = _normalize_optional(payload.subscription_status)
    if payload.subscription_end_date is not None:
        profile.subscription_end_date = payload.subscription_end_date
    if payload.trial_end_date is not None:
        profile.trial_end_date = payload.trial_end_date
    if payload.max_users is not None:
        if payload.max_users <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_users debe ser mayor que 0.",
            )
        profile.max_users = int(payload.max_users)

    if payload.brand_color is not None:
        if not HEX_COLOR_PATTERN.match(payload.brand_color):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="brand_color debe tener formato #RRGGBB.",
            )
        if branding is None:
            branding = TenantBranding(tenant_id=tenant_id)
        branding.accent_color = payload.brand_color.lower()
        branding.updated_at = datetime.utcnow()
        session.add(branding)

    if payload.commercial_name is not None and branding is not None:
        branding.company_name = profile.commercial_name
        branding.updated_at = datetime.utcnow()
        session.add(branding)

    profile.updated_at = datetime.utcnow()
    session.add(tenant)
    session.add(profile)
    session.commit()

    session.refresh(tenant)
    session.refresh(profile)
    branding = _load_branding(session, tenant_id)
    return _to_organization_read(session, tenant, profile, branding)


@router.post("/organization/me/logo", response_model=OrganizationRead)
def upload_my_organization_logo(
    logo: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrganizationRead:
    tenant_id = _tenant_id_for_user(current_user)
    tenant = _load_tenant_or_404(session, tenant_id)
    profile = _load_or_create_profile(session, tenant)

    try:
        update_branding(
            session=session,
            tenant_id=tenant_id,
            accent_color=None,
            logo_upload=logo,
            company_name=None,
            company_subtitle=None,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    branding = _load_branding(session, tenant_id)
    return _to_organization_read(session, tenant, profile, branding)


@router.delete("/organization/me/logo", response_model=OrganizationRead)
def remove_my_organization_logo(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrganizationRead:
    tenant_id = _tenant_id_for_user(current_user)
    tenant = _load_tenant_or_404(session, tenant_id)
    profile = _load_or_create_profile(session, tenant)
    branding = _load_branding(session, tenant_id)

    if branding and branding.logo_path:
        if branding.logo_path.startswith("/static/logos/"):
            filename = branding.logo_path.rsplit("/", 1)[-1]
            file_path = Path(settings.logos_storage_path) / filename
            if file_path.exists():
                file_path.unlink()
        branding.logo_path = None
        branding.updated_at = datetime.utcnow()
        session.add(branding)
        session.commit()
        session.refresh(branding)

    profile.updated_at = datetime.utcnow()
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return _to_organization_read(session, tenant, profile, branding)


@router.get("/users/me/preferences", response_model=UserPreferenceRead)
def get_my_user_preferences(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserPreferenceRead:
    pref = session.exec(
        select(UserPreference).where(UserPreference.user_id == int(current_user.id)),
    ).one_or_none()

    if pref is None:
        return UserPreferenceRead(user_platform="all", updated_at=None)

    return UserPreferenceRead(
        user_platform=pref.user_platform,
        updated_at=pref.updated_at,
    )


@router.patch("/users/me/preferences", response_model=UserPreferenceRead)
def update_my_user_preferences(
    payload: UserPreferenceUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserPreferenceRead:
    platform = (payload.user_platform or "").strip().lower()
    if platform not in VALID_PLATFORMS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plataforma no valida. Usa all, windows, android o web.",
        )

    pref = session.exec(
        select(UserPreference).where(UserPreference.user_id == int(current_user.id)),
    ).one_or_none()
    if pref is None:
        pref = UserPreference(user_id=int(current_user.id), user_platform=platform)
    else:
        pref.user_platform = platform
        pref.updated_at = datetime.utcnow()

    session.add(pref)
    session.commit()
    session.refresh(pref)
    return UserPreferenceRead(
        user_platform=pref.user_platform,
        updated_at=pref.updated_at,
    )
