from typing import Optional

from sqlmodel import Session

from app.models.audit_log import AuditLog


def log_action(
    session: Session,
    *,
    user_id: Optional[int],
    tenant_id: Optional[int],
    action: str,
    details: Optional[str] = None,
) -> None:
    """
    Registra una acción en la tabla de auditoría.

    Parámetros:
    - `user_id`: ID del usuario que realiza la acción (si está autenticado).
    - `tenant_id`: ID del tenant sobre el que se actúa (si aplica).
    - `action`: Descripción corta de la acción (ej: 'user.login', 'tenant.create').
    - `details`: Información adicional (JSON serializado, texto, etc.).
    """

    audit = AuditLog(
        user_id=user_id,
        tenant_id=tenant_id,
        action=action,
        details=details,
    )
    session.add(audit)
    # Se realiza commit aquí porque normalmente se llama tras completar la operación.
    session.commit()

