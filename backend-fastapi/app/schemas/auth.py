from pydantic import BaseModel, EmailStr, field_validator


class LoginResponse(BaseModel):
    """
    Respuesta del endpoint de login (primer paso).
    """

    access_token: str | None = None
    token_type: str | None = None
    mfa_required: bool
    message: str | None = None


class MFAVerifyRequest(BaseModel):
    """
    Cuerpo de la petición para verificar MFA (paso 2).
    """

    username: EmailStr
    mfa_code: str


class MFAVerifyResponse(BaseModel):
    """
    Respuesta tras verificar MFA correctamente.
    """

    access_token: str
    token_type: str
    mfa_required: bool


class ForgotPasswordRequest(BaseModel):
    """Cuerpo para solicitar un enlace de recuperación de contraseña."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Cuerpo para confirmar el reset con el token recibido por email."""

    token: str
    new_password: str
    new_password_confirm: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


class ResetPasswordResponse(BaseModel):
    """Respuesta tras confirmar el reset: devuelve el email del usuario."""

    email: str

