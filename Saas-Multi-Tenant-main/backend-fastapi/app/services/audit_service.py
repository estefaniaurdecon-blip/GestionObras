from typing import List, Optional

from sqlmodel import Session, select

from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogRead
from app.models.user import User as UserModel


def list_audit_logs(
    session: Session,
    current_user: UserModel,
    *,
    tenant_id: Optional[int] = None,
    limit: int = 100,
) -> List[AuditLogRead]:
    """
    Devuelve registros de auditoria.

    Reglas de visibilidad:
    - Super Admin: puede ver todos los registros, opcionalmente filtrados por tenant_id.
    - Resto de usuarios: solo ven registros de su propio tenant.
    """

    statement = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)

    if current_user.is_super_admin:
        if tenant_id is not None:
            statement = statement.where(AuditLog.tenant_id == tenant_id)
    else:
        if not current_user.tenant_id:
            # Usuario sin tenant asignado no puede consultar auditoria.
            raise PermissionError("El usuario no está asociado a ningún tenant")
        statement = statement.where(AuditLog.tenant_id == current_user.tenant_id)

    logs = session.exec(statement).all()

    # Resolvemos emails de usuarios para mostrar en la tabla.
    user_ids = {log.user_id for log in logs if log.user_id is not None}
    users = (
        session.exec(select(User).where(User.id.in_(user_ids))).all()
        if user_ids
        else []
    )
    email_by_id = {user.id: user.email for user in users}

    return [
        AuditLogRead(
            id=log.id,
            created_at=log.created_at,
            user_email=email_by_id.get(log.user_id),
            action=log.action,
            details=log.details,
        )
        for log in logs
    ]


