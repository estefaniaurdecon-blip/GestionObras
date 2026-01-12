from datetime import datetime, timedelta
import secrets

from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.config import settings
from app.core.email import send_mfa_email_code
from app.core.security import create_access_token, hash_password, verify_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.user import User
from app.schemas.auth import LoginResponse, MFAVerifyResponse
from app.schemas.password import ChangePasswordRequest


def authenticate_user(session: Session, email: str, password: str) -> User:
    """
    Autentica un usuario por email y contraseña.

    Lanza ValueError si las credenciales no son válidas.
    """

    statement = select(User).where(User.email == email)
    user = session.exec(statement).one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise ValueError("Credenciales incorrectas")

    return user


def login_step1(session: Session, email: str, password: str) -> LoginResponse:
    """
    Paso 1 de login:
    - Valida credenciales.
    - Si el usuario es SUPER_ADMIN, devuelve token directo sin MFA.
    - Para el resto de usuarios, genera y envía un código MFA por email
      y marca `mfa_required=True`.
    """

    user = authenticate_user(session, email, password)

    # Super Admin nunca usa MFA.
    if user.is_super_admin:
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
            extra_claims={
                "tenant_id": user.tenant_id,
                "is_super_admin": user.is_super_admin,
            },
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

    # Resto de usuarios: siempre MFA por email.
    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = hash_password(code)
    expires_at = datetime.utcnow() + timedelta(minutes=5)

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

    # Enviamos el código por email (no interrumpimos login si el envío falla).
    try:
        send_mfa_email_code(to_email=user.email, code=code)
    except Exception:
        pass

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="login.mfa_request",
        details="Se ha enviado un código MFA por correo electrónico",
    )

    return LoginResponse(
        mfa_required=True,
        message="MFA requerido, revisa tu correo para obtener el código",
    )


def login_step2_verify_mfa(
    session: Session,
    username: str,
    mfa_code: str,
) -> MFAVerifyResponse:
    """
    Paso 2 de login:
    - Verifica el código MFA enviado por correo para el usuario indicado.
    - Devuelve token de acceso completo en caso de éxito.
    """

    statement = select(User).where(User.email == username)
    user = session.exec(statement).one_or_none()

    if not user:
        raise ValueError("Usuario no encontrado")

    mfa_record = session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one_or_none()

    if not mfa_record:
        raise ValueError("No hay un código MFA activo para este usuario")

    if mfa_record.expires_at < datetime.utcnow():
        # Código expirado: lo invalidamos.
        session.delete(mfa_record)
        session.commit()
        raise ValueError("El código MFA ha expirado, vuelve a iniciar sesión")

    # Verificamos el código.
    if not verify_password(mfa_code, mfa_record.code_hash):
        mfa_record.failed_attempts += 1
        session.add(mfa_record)
        session.commit()

        if mfa_record.failed_attempts >= 3:
            # Invalida el código tras 3 intentos fallidos.
            session.delete(mfa_record)
            session.commit()
            raise ValueError(
                "Has superado el número de intentos. "
                "Vuelve a iniciar sesión para obtener un nuevo código MFA.",
            )

        raise ValueError("Código MFA incorrecto")

    # Código correcto: marcamos el usuario como activo (primera verificación)
    # e invalidamos el registro MFA.
    if not user.is_active:
        user.is_active = True
        session.add(user)

    session.delete(mfa_record)
    session.commit()

    access_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        extra_claims={
            "tenant_id": user.tenant_id,
            "is_super_admin": user.is_super_admin,
        },
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


def change_password(
    session: Session,
    user: User,
    data: ChangePasswordRequest,
) -> None:
    """
    Cambia la contraseña del propio usuario verificando la actual
    y aplicando validaciones básicas a la nueva.
    """

    if data.new_password != data.new_password_confirm:
        raise ValueError("La nueva contraseña y su confirmación no coinciden")

    if len(data.new_password) < 8:
        raise ValueError("La nueva contraseña debe tener al menos 8 caracteres")

    if not verify_password(data.current_password, user.hashed_password):
        raise ValueError("La contraseña actual no es correcta")

    if verify_password(data.new_password, user.hashed_password):
        raise ValueError("La nueva contraseña no puede ser igual a la actual")

    user.hashed_password = hash_password(data.new_password)
    session.add(user)
    session.commit()

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="user.change_password",
        details="Cambio de contraseña del propio usuario",
    )
