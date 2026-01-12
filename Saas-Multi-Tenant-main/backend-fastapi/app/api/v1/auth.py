from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

from app.db.session import get_session
from app.schemas.auth import LoginResponse, MFAVerifyRequest, MFAVerifyResponse
from app.schemas.password import ChangePasswordRequest
from app.services.auth_service import login_step1, login_step2_verify_mfa, change_password
from app.api.deps import get_current_active_user
from app.models.user import User
from app.core.rate_limit import enforce_rate_limit


router = APIRouter()


@router.post(
    "/login",
    summary="Login con usuario y contraseña",
    response_model=LoginResponse,
)
def login(
    request: Request,
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
        return login_step1(session, email=form_data.username, password=form_data.password)
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
        return login_step2_verify_mfa(
            session,
            username=body.username,
            mfa_code=body.mfa_code,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
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

