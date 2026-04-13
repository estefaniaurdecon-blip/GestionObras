import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from passlib.context import CryptContext
import pyotp

from .config import settings


class JWTError(Exception):
    """Raised when a JWT cannot be decoded or validated."""


# Contexto de Passlib para gestionar hash de contraseñas de forma segura.
# Usamos pbkdf2_sha256 para evitar problemas de backend con bcrypt
# dentro de contenedores Docker y mantener un buen nivel de seguridad.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

_SUPPORTED_JWT_ALGORITHMS = {"HS256"}


def _ensure_supported_algorithm(algorithm: str) -> str:
    if algorithm not in _SUPPORTED_JWT_ALGORITHMS:
        raise ValueError(f"Algoritmo JWT no soportado: {algorithm}")
    return algorithm


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))
    except Exception as exc:
        raise JWTError("Token malformado") from exc


def _sign_hs256(message: bytes, secret: str) -> bytes:
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()


def hash_password(password: str) -> str:
    """
    Devuelve el hash seguro de una contraseña.
    Nunca guardamos contraseñas en texto plano.
    """

    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica si una contraseña plana coincide con su hash.
    """

    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
    token_type: str = "access",
) -> str:
    """
    Crea un JWT con:
    - `sub`: identificador principal (generalmente el ID de usuario).
    - `exp`: fecha de expiración.
    - `iat`: fecha de emisión.
    - `typ`: tipo de token (por defecto "access").

    `extra_claims` permite incluir información adicional (tenant_id, roles, etc.).
    """

    algorithm = _ensure_supported_algorithm(settings.algorithm)

    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.access_token_expire_minutes)

    now = datetime.now(tz=timezone.utc)
    expire = now + expires_delta

    payload: Dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "typ": token_type,
    }

    if extra_claims:
        payload.update(extra_claims)

    header = {"alg": algorithm, "typ": "JWT"}
    header_segment = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    signature_segment = _b64url_encode(_sign_hs256(signing_input, settings.secret_key))
    return f"{header_segment}.{payload_segment}.{signature_segment}"


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decodifica y valida un JWT.

    Lanza `JWTError` si el token no es válido o ha expirado.
    """

    _ensure_supported_algorithm(settings.algorithm)

    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:
        raise JWTError("Token malformado") from exc

    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    expected_signature = _b64url_encode(_sign_hs256(signing_input, settings.secret_key))
    if not hmac.compare_digest(signature_segment, expected_signature):
        raise JWTError("Firma JWT no válida")

    try:
        header = json.loads(_b64url_decode(header_segment))
        payload = json.loads(_b64url_decode(payload_segment))
    except json.JSONDecodeError as exc:
        raise JWTError("Token malformado") from exc

    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise JWTError("Token malformado")

    if header.get("alg") != settings.algorithm:
        raise JWTError("Algoritmo JWT no válido")

    exp = payload.get("exp")
    if exp is None:
        raise JWTError("Token sin expiración")

    try:
        exp_ts = int(exp)
    except (TypeError, ValueError) as exc:
        raise JWTError("Expiración JWT no válida") from exc

    now_ts = int(datetime.now(tz=timezone.utc).timestamp())
    if exp_ts <= now_ts:
        raise JWTError("Token expirado")

    return payload


def generate_mfa_secret() -> str:
    """
    Genera una clave secreta para MFA basada en TOTP (Time-based One-Time Password).

    Esta clave debe guardarse asociada al usuario en base de datos.
    """

    return pyotp.random_base32()


def get_mfa_uri(username: str, secret: str) -> str:
    """
    Devuelve la URI compatible con aplicaciones de autenticación (Google Authenticator, etc.).

    Esta URI puede transformarse en un QR en el frontend.
    """

    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name="SaaS Multi-Tenant")


def verify_mfa_token(secret: str, token: str) -> bool:
    """
    Verifica el código TOTP introducido por el usuario.
    """

    totp = pyotp.TOTP(secret)
    return totp.verify(token)
