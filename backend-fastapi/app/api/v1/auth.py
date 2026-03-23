from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.core.config import settings
from app.db.session import get_session
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginResponse,
    MFAVerifyRequest,
    MFAVerifyResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
)
from app.schemas.password import ChangePasswordRequest
from app.core.email import send_password_reset_email
from app.services.auth_service import (
    _build_mfa_trust_token,
    _build_superadmin_refresh_token,
    change_password,
    confirm_password_reset,
    login_step1,
    login_step2_verify_mfa,
    refresh_super_admin_session,
    request_password_reset,
)
from app.api.deps import get_current_active_user
from app.models.user import User
from app.core.rate_limit import enforce_rate_limit


router = APIRouter()


def _get_user_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).one_or_none()


@router.post(
    "/login",
    summary="Login con usuario y contraseña",
    response_model=LoginResponse,
)
def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session),
) -> LoginResponse:
    """
    Paso 1 del login:
    - Verificamos email/usuario + contraseña.
    - Si requiere MFA, no devuelve token, solo indica `mfa_required=True`.
    """

    # Rate limiting sencillo para evitar fuerza bruta masiva.
    enforce_rate_limit(request, key="auth_login", limit=20, window_seconds=60)

    try:
        trust_cookie = request.cookies.get(settings.mfa_trust_cookie_name)
        result = login_step1(
            session,
            email=form_data.username,
            password=form_data.password,
            mfa_trust_token=trust_cookie,
        )
        if result.access_token:
            user = _get_user_by_email(session, form_data.username)
            response.set_cookie(
                settings.auth_cookie_name,
                result.access_token,
                httponly=True,
                secure=settings.auth_cookie_secure,
                samesite=settings.auth_cookie_samesite,
                max_age=settings.access_token_expire_minutes * 60,
            )
            if user and user.is_super_admin:
                response.delete_cookie(
                    settings.mfa_trust_cookie_name,
                    httponly=True,
                    secure=settings.auth_cookie_secure,
                    samesite=settings.auth_cookie_samesite,
                )
                response.set_cookie(
                    settings.superadmin_refresh_cookie_name,
                    _build_superadmin_refresh_token(user),
                    httponly=True,
                    secure=settings.auth_cookie_secure,
                    samesite=settings.auth_cookie_samesite,
                    max_age=settings.superadmin_refresh_hours * 3600,
                )
            elif user:
                response.delete_cookie(
                    settings.superadmin_refresh_cookie_name,
                    httponly=True,
                    secure=settings.auth_cookie_secure,
                    samesite=settings.auth_cookie_samesite,
                )
                response.set_cookie(
                    settings.mfa_trust_cookie_name,
                    _build_mfa_trust_token(user),
                    httponly=True,
                    secure=settings.auth_cookie_secure,
                    samesite=settings.auth_cookie_samesite,
                    max_age=settings.mfa_trust_hours * 3600,
                )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/mfa/verify",
    summary="Verificación MFA (TOTP)",
    response_model=MFAVerifyResponse,
)
def verify_mfa(
    request: Request,
    response: Response,
    body: MFAVerifyRequest,
    session: Session = Depends(get_session),
) -> MFAVerifyResponse:
    """
    Paso 2 del login para usuarios con MFA:
    - Recibe email y código MFA.
    - Si el código es correcto, genera el JWT final.
    """

    # Rate limiting para evitar fuerza bruta de códigos MFA.
    enforce_rate_limit(request, key="auth_mfa_verify", limit=30, window_seconds=300)

    try:
        result = login_step2_verify_mfa(
            session,
            username=body.username,
            mfa_code=body.mfa_code,
        )
        response.set_cookie(
            settings.auth_cookie_name,
            result.access_token,
            httponly=True,
            secure=settings.auth_cookie_secure,
            samesite=settings.auth_cookie_samesite,
            max_age=settings.access_token_expire_minutes * 60,
        )
        user = _get_user_by_email(session, body.username)
        if user and not user.is_super_admin:
            response.delete_cookie(
                settings.superadmin_refresh_cookie_name,
                httponly=True,
                secure=settings.auth_cookie_secure,
                samesite=settings.auth_cookie_samesite,
            )
            response.set_cookie(
                settings.mfa_trust_cookie_name,
                _build_mfa_trust_token(user),
                httponly=True,
                secure=settings.auth_cookie_secure,
                samesite=settings.auth_cookie_samesite,
                max_age=settings.mfa_trust_hours * 3600,
            )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/refresh",
    summary="Renovar sesión automática de SUPER_ADMIN",
    response_model=MFAVerifyResponse,
)
def refresh_session(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> MFAVerifyResponse:
    try:
        refresh_cookie = request.cookies.get(settings.superadmin_refresh_cookie_name)
        user, access_token = refresh_super_admin_session(session, refresh_cookie)
        response.set_cookie(
            settings.auth_cookie_name,
            access_token,
            httponly=True,
            secure=settings.auth_cookie_secure,
            samesite=settings.auth_cookie_samesite,
            max_age=settings.access_token_expire_minutes * 60,
        )
        response.set_cookie(
            settings.superadmin_refresh_cookie_name,
            _build_superadmin_refresh_token(user),
            httponly=True,
            secure=settings.auth_cookie_secure,
            samesite=settings.auth_cookie_samesite,
            max_age=settings.superadmin_refresh_hours * 3600,
        )
        return MFAVerifyResponse(
            access_token=access_token,
            token_type="bearer",
            mfa_required=False,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cambiar contraseña del propio usuario",
)
def change_my_password(
    body: ChangePasswordRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    """
    Permite al usuario autenticado cambiar su contraseña.
    """

    try:
        return change_password(session=session, user=current_user, data=body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Solicitar enlace de recuperación de contraseña",
)
def forgot_password(
    request: Request,
    background_tasks: BackgroundTasks,
    body: ForgotPasswordRequest,
    session: Session = Depends(get_session),
) -> None:
    """
    Genera un token de reset y programa el envío del email en background.
    Siempre responde 204 inmediatamente para no revelar si el email existe.
    """
    enforce_rate_limit(request, key="auth_forgot_password", limit=5, window_seconds=300)
    result = request_password_reset(session=session, email=body.email)
    if result is not None:
        to_email, reset_url = result
        background_tasks.add_task(send_password_reset_email, to_email, reset_url)


@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
    summary="Confirmar nueva contraseña con el token recibido",
)
def reset_password(
    body: ResetPasswordRequest,
    session: Session = Depends(get_session),
) -> ResetPasswordResponse:
    """
    Valida el token de reset, actualiza la contraseña y devuelve el email del usuario
    para que el cliente pueda actualizar las credenciales offline.
    """
    try:
        email = confirm_password_reset(session=session, data=body)
        return ResetPasswordResponse(email=email)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cerrar sesion y limpiar cookie",
)
def logout(response: Response) -> None:
    response.delete_cookie(
        settings.auth_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
    )
    response.delete_cookie(
        settings.mfa_trust_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
    )
    response.delete_cookie(
        settings.superadmin_refresh_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
    )
