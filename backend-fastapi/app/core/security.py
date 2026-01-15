from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
import pyotp

from .config import settings


# Contexto de Passlib para gestionar hash de contraseñas de forma segura.
# Usamos pbkdf2_sha256 para evitar problemas de backend con bcrypt
# dentro de contenedores Docker y mantener un buen nivel de seguridad.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


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

  if expires_delta is None:
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)

  now = datetime.now(tz=timezone.utc)
  expire = now + expires_delta

  to_encode: Dict[str, Any] = {
    "sub": subject,
    "iat": int(now.timestamp()),
    "exp": int(expire.timestamp()),
    "typ": token_type,
  }

  if extra_claims:
    to_encode.update(extra_claims)

  encoded_jwt = jwt.encode(
    to_encode,
    settings.secret_key,
    algorithm=settings.algorithm,
  )
  return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
  """
  Decodifica y valida un JWT.

  Lanza `JWTError` si el token no es válido o ha expirado.
  """

  payload = jwt.decode(
    token,
    settings.secret_key,
    algorithms=[settings.algorithm],
  )
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

