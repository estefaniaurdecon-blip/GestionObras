from email.message import EmailMessage
import logging
import smtplib
from typing import Optional

from app.core.config import settings


logger = logging.getLogger("app.email")


def _get_smtp_params() -> tuple[str | None, int, str | None, str | None, str | None, bool]:
    host = getattr(settings, "smtp_host", None)
    port = getattr(settings, "smtp_port", 587)
    username = getattr(settings, "smtp_username", None)
    password = getattr(settings, "smtp_password", None)
    from_email = getattr(settings, "smtp_from", None) or username
    use_tls = getattr(settings, "smtp_use_tls", True)
    return host, port, username, password, from_email, use_tls


def _send_email(to_emails: list[str], subject: str, body: str) -> None:
    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        return

    recipients = [email.strip() for email in to_emails if email and email.strip()]
    if not recipients:
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = ", ".join(sorted(set(recipients)))
    msg.set_content(body)

    try:
        if use_tls:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port) as server:
                server.login(username, password)
                server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando email a %s: %s", msg["To"], exc)


def send_tenant_admin_welcome_email(
    to_email: str,
    tenant_name: str,
    plain_password: Optional[str] = None,
) -> None:
    """
    Correo de bienvenida al admin del tenant (sin enviar contraseña en claro).
    """

    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        return

    frontend_url = settings.frontend_base_url
    if not frontend_url:
        return

    subject = f"Bienvenido como administrador del tenant {tenant_name}"
    body = (
        f"Hola,\n\n"
        f"Te hemos dado de alta como administrador del tenant '{tenant_name}'.\n\n"
        f"Puedes acceder al panel en:\n"
        f"{frontend_url}\n\n"
        f"Si no esperabas este correo, contacta con el administrador de la plataforma.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if use_tls:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port) as server:
                server.login(username, password)
                server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando email de bienvenida a %s: %s", to_email, exc)


def send_mfa_email_code(to_email: str, code: str) -> None:
    """
    Envía un código MFA de un solo uso al correo del usuario.

    Si SMTP no está configurado, en modo DEBUG se muestra el código en logs.
    """

    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG MFA: código para %s (sin SMTP configurado) = %s",
                to_email,
                code,
            )
        return

    subject = "Tu código de verificación (MFA)"
    body = (
        f"Hola,\n\n"
        f"Tu código de verificación es: {code}\n\n"
        f"Este código caduca en unos minutos y es válido solo para este inicio de sesión.\n\n"
        f"Si no has intentado iniciar sesión, ignora este mensaje.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if use_tls:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port) as server:
                server.login(username, password)
                server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando código MFA a %s: %s", to_email, exc)
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG MFA (fallo SMTP): código para %s = %s",
                to_email,
                code,
            )


def _get_reset_smtp_params() -> tuple[str | None, int, str | None, str | None, str | None, bool]:
    """Devuelve parámetros SMTP para reset de contraseña.

    Si están configurados los vars RESET_SMTP_*, los usa; si no, cae al SMTP principal.
    """
    host = getattr(settings, "reset_smtp_host", None)
    if host:
        port = getattr(settings, "reset_smtp_port", 587)
        username = getattr(settings, "reset_smtp_username", None)
        password = getattr(settings, "reset_smtp_password", None)
        from_email = getattr(settings, "reset_smtp_from", None) or username
        use_tls = getattr(settings, "reset_smtp_use_tls", True)
        return host, port, username, password, from_email, use_tls
    return _get_smtp_params()


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """
    Envía un enlace de recuperación de contraseña al usuario.
    Usa RESET_SMTP_* si está configurado, si no el SMTP principal.
    """

    host, port, username, password, from_email, use_tls = _get_reset_smtp_params()
    if not host or not username or not password or not from_email:
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG RESET: enlace de recuperación para %s = %s",
                to_email,
                reset_url,
            )
        return

    subject = "Recuperación de contraseña"
    body = (
        f"Hola,\n\n"
        f"Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.\n\n"
        f"Haz clic en el siguiente enlace para crear una nueva contraseña:\n"
        f"{reset_url}\n\n"
        f"Este enlace caduca en 1 hora. Si no solicitaste el cambio, ignora este mensaje.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if use_tls:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port) as server:
                server.login(username, password)
                server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando email de reset a %s: %s", to_email, exc)
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG RESET (fallo SMTP): enlace para %s = %s",
                to_email,
                reset_url,
            )


def send_user_invitation_email(
    to_email: str,
    tenant_name: str,
    accept_url: str,
    role_name: str,
) -> None:
    """
    Envía un correo de invitación para que un usuario complete su alta.
    """

    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        # Sin SMTP configurado simplemente no enviamos correo.
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG INVITATION: enlace de invitación para %s = %s",
                to_email,
                accept_url,
            )
        return

    subject = f"Invitación a la plataforma URDECON INNOVA ({tenant_name})"
    body = (
        f"Hola,\n\n"
        f"Has sido invitado a la plataforma URDECON INNOVA como '{role_name}' "
        f"en el tenant '{tenant_name}'.\n\n"
        f"Para completar tu alta y definir tu contraseña, entra en:\n"
        f"{accept_url}\n\n"
        f"Si no estabas esperando esta invitación, puedes ignorar este mensaje.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if use_tls:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port) as server:
                server.login(username, password)
                server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando email de invitación a %s: %s", to_email, exc)

