from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class NotificationType(str, Enum):
    
    #Tipo de notificación para el centro de avisos.
    
    TICKET_ASSIGNED = "ticket_assigned"
    TICKET_COMMENT = "ticket_comment"
    TICKET_STATUS = "ticket_status"
    GENERIC = "generic"


class Notification(SQLModel, table=True):
    
    #Notificación dirigida a un usuario concreto dentro de un tenant.
    

    id: Optional[int] = Field(default=None, primary_key=True)

    tenant_id: int = Field(
        foreign_key="tenant.id",
        index=True,
        description="Tenant al que pertenece la notificación",
    )
    user_id: int = Field(
        foreign_key="user.id",
        index=True,
        description="Usuario destinatario de la notificación",
    )

    type: NotificationType = Field(
        default=NotificationType.GENERIC,
        index=True,
        description="Tipo lógico de la notificación",
    )
    title: str = Field(max_length=200)
    body: Optional[str] = None
    reference: Optional[str] = Field(
        default=None,
        description="Referencia opcional al recurso (ej. ticket_id=123)",
    )

    is_read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    read_at: Optional[datetime] = None

