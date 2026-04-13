from datetime import datetime, timedelta
from app.core.datetime import utc_now
import secrets

from sqlmodel import Session, select

import logging

from app.core.audit import log_action
from app.core.config import settings
from app.core.email import send_mfa_email_code, send_password_reset_email

logger = logging.getLogger("app.auth_service")
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.auth import LoginResponse, MFAVerifyResponse, ResetPasswordRequest
from app.schemas.password import ChangePasswordRequest


def authenticate_user(session: Session, email: str, password: str) -> User:
    """
    Autentica un usuario por email y contraseÃ±a.

    Lanza ValueError si las credenciales no son vÃ¡lidas.
    """

    statement = select(User).where(User.email == email)
    user = session.exec(statement).one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise ValueError("Credenciales incorrectas")

    return user


def _build_mfa_trust_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(hours=settings.mfa_trust_hours),
        token_type="mfa_trust",
    )


def _build_superadmin_refresh_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(hours=settings.superadmin_refresh_hours),
        token_type="superadmin_refresh",
    )


def _is_mfa_trusted_for_user(user: User, mfa_trust_token: str | None) -> bool:
    if not mfa_trust_token:
        return False
    try:
        payload = decode_token(mfa_trust_token)
    except Exception:
        return False
    if payload.get("typ") != "mfa_trust":
        return False
    return payload.get("sub") == str(user.id)


def login_step1(
    session: Session,
    email: str,
    password: str,
    mfa_trust_token: str | None = None,
) -> LoginResponse:
    """
    Paso 1 de login:
    - Valida credenciales.
    - Si el usuario es SUPER_ADMIN, devuelve token directo sin MFA.
    - Para el resto de usuarios, genera y envÃ­a un cÃ³digo MFA por email
      y marca `mfa_required=True`.
    """

    user = authenticate_user(session, email, password)

    # Super Admin nunca usa MFA.
    if user.is_super_admin:
        # Access token is minimal; roles are always read from the database.
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )

        log_action(
            session,
            user_id=user.id,
            tenant_id=user.tenant_id,
            action="login",
            details="Login sin MFA (SUPER_ADMIN)",
        )

        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            mfa_required=False,
        )

    # Si el dispositivo ya fue marcado como confiable en las ultimas 24h,
    # omitimos MFA y emitimos token de acceso directamente.
    if _is_mfa_trusted_for_user(user, mfa_trust_token):
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )
        log_action(
            session,
            user_id=user.id,
            tenant_id=user.tenant_id,
            action="login.mfa_trusted",
            details="Login sin MFA por dispositivo confiable",
        )
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            mfa_required=False,
        )

    # Resto de usuarios: MFA por email.
    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = hash_password(code)
    expires_at = utc_now() + timedelta(hours=24)

    # Guardamos/actualizamos el registro MFA para este usuario.
    mfa_record = session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one_or_none()

    if mfa_record:
        mfa_record.code_hash = code_hash
        mfa_record.expires_at = expires_at
        mfa_record.failed_attempts = 0
        session.add(mfa_record)
    else:
        session.add(
            MFAEmailCode(
                user_id=user.id,
                code_hash=code_hash,
                expires_at=expires_at,
                failed_attempts=0,
            ),
        )

    session.commit()

    # Enviamos el cÃ³digo por email (no interrumpimos login si el envÃ­o falla).
    try:
        send_mfa_email_code(to_email=user.email, code=code)
    except Exception:
        pass

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="login.mfa_request",
        details="Se ha enviado un cÃ³digo MFA por correo electrÃ³nico",
    )

    return LoginResponse(
        mfa_required=True,
        message="MFA requerido, revisa tu correo para obtener el cÃ³digo (vÃ¡lido 24h)",
    )


def login_step2_verify_mfa(
    session: Session,
    username: str,
    mfa_code: str,
) -> MFAVerifyResponse:
    """
    Paso 2 de login:
    - Verifica el cÃ³digo MFA enviado por correo para el usuario indicado.
    - Devuelve token de acceso completo en caso de Ã©xito.
    """

    statement = select(User).where(User.email == username)
    user = session.exec(statement).one_or_none()

    if not user:
        raise ValueError("Usuario no encontrado")

    mfa_record = session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one_or_none()

    if not mfa_record:
        raise ValueError("No hay un cÃ³digo MFA activo para este usuario")

    if mfa_record.expires_at < utc_now():
        # CÃ³digo expirado: lo invalidamos.
        session.delete(mfa_record)
        session.commit()
        raise ValueError("El cÃ³digo MFA ha expirado, vuelve a iniciar sesiÃ³n")

    # Verificamos el cÃ³digo.
    if not verify_password(mfa_code, mfa_record.code_hash):
        mfa_record.failed_attempts += 1
        session.add(mfa_record)
        session.commit()

        if mfa_record.failed_attempts >= 3:
            # Invalida el cÃ³digo tras 3 intentos fallidos.
            session.delete(mfa_record)
            session.commit()
            raise ValueError(
                "Has superado el nÃºmero de intentos. "
                "Vuelve a iniciar sesiÃ³n para obtener un nuevo cÃ³digo MFA.",
            )

        raise ValueError("CÃ³digo MFA incorrecto")

    # CÃ³digo correcto: marcamos el usuario como activo (primera verificaciÃ³n)
    # e invalidamos el registro MFA.
    if not user.is_active:
        user.is_active = True
        session.add(user)

    session.delete(mfa_record)
    session.commit()

    # Access token is minimal; roles are always read from the database.
    access_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="mfa.verify",
        details="Login con MFA por email satisfactorio",
    )

    return MFAVerifyResponse(
        access_token=access_token,
        token_type="bearer",
        mfa_required=False,
    )


def refresh_super_admin_session(
    session: Session,
    refresh_token: str | None,
) -> tuple[User, str]:
    """
    Renueva la sesiÃ³n de un SUPER_ADMIN usando una cookie de refresco
    separada del JWT de acceso.
    """

    if not refresh_token:
        raise ValueError("No hay una sesiÃ³n renovable activa")

    try:
        payload = decode_token(refresh_token)
    except Exception as exc:
        raise ValueError("La sesiÃ³n renovable ha expirado. Inicia sesiÃ³n de nuevo.") from exc

    if payload.get("typ") != "superadmin_refresh":
        raise ValueError("Token de renovaciÃ³n no permitido")

    user_id = payload.get("sub")
    if user_id is None:
        raise ValueError("Token de renovaciÃ³n invÃ¡lido")

    user = session.get(User, int(user_id))
    if not user or not user.is_active or not user.is_super_admin:
        raise ValueError("La sesiÃ³n renovable ya no es vÃ¡lida")

    access_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="login.refresh",
        details="RenovaciÃ³n automÃ¡tica de sesiÃ³n SUPER_ADMIN",
    )

    return user, access_token


def change_password(
    session: Session,
    user: User,
    data: ChangePasswordRequest,
) -> None:
    """
    Cambia la contraseÃ±a del propio usuario verificando la actual
    y aplicando validaciones bÃ¡sicas a la nueva.
    """

    if data.new_password != data.new_password_confirm:
        raise ValueError("La nueva contraseÃ±a y su confirmaciÃ³n no coinciden")

    if len(data.new_password) < 8:
        raise ValueError("La nueva contraseÃ±a debe tener al menos 8 caracteres")

    if not verify_password(data.current_password, user.hashed_password):
        raise ValueError("La contraseÃ±a actual no es correcta")

    if verify_password(data.new_password, user.hashed_password):
        raise ValueError("La nueva contraseÃ±a no puede ser igual a la actual")

    user.hashed_password = hash_password(data.new_password)
    session.add(user)
    session.commit()

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="user.change_password",
        details="Cambio de contraseÃ±a del propio usuario",
    )


def request_password_reset(session: Session, email: str) -> tuple[str, str] | None:
    """
    Genera un token de reset, lo persiste en BD y devuelve (to_email, reset_url).

    Si el email no existe devuelve None sin revelar ese dato.
    El envÃ­o del correo queda en manos del llamador (background task).
    """

    user = session.exec(select(User).where(User.email == email)).one_or_none()
    if not user:
        return None  # No revelar si el email existe o no

    # Token en claro (se envÃ­a por email) y su hash (se guarda en BD)
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_password(raw_token)
    expires_at = utc_now() + timedelta(hours=1)

    # Reemplazar token anterior si existÃ­a
    existing = session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    ).one_or_none()
    if existing:
        session.delete(existing)
        session.flush()

    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    session.commit()

    frontend_url = (settings.frontend_base_url or "http://localhost:8000").rstrip("/")
    reset_url = f"{frontend_url}/#/update-password?token={raw_token}"

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="auth.password_reset_request",
        details="Solicitud de recuperaciÃ³n de contraseÃ±a",
    )

    return user.email, reset_url


def confirm_password_reset(session: Session, data: ResetPasswordRequest) -> str:
    """
    Valida el token de reset, actualiza la contraseÃ±a y devuelve el email del usuario.
    """

    if data.new_password != data.new_password_confirm:
        raise ValueError("Las contraseÃ±as no coinciden")

    # Buscar todos los tokens vÃ¡lidos (no expirados) y verificar
    now = utc_now()
    records = session.exec(
        select(PasswordResetToken).where(PasswordResetToken.expires_at > now)
    ).all()

    matched: PasswordResetToken | None = None
    for record in records:
        if verify_password(data.token, record.token_hash):
            matched = record
            break

    if not matched:
        raise ValueError("El enlace no es vÃ¡lido o ha caducado. Solicita uno nuevo.")

    user = session.get(User, matched.user_id)
    if not user:
        raise ValueError("Usuario no encontrado")

    user.hashed_password = hash_password(data.new_password)
    if not user.is_active:
        user.is_active = True
    session.add(user)

    session.delete(matched)
    session.commit()

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="auth.password_reset_confirm",
        details="ContraseÃ±a restablecida mediante enlace de recuperaciÃ³n",
    )

    return user.email
