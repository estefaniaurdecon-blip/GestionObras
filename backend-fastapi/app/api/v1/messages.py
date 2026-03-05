from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.message import MessageCreate, MessageListResponse, MessageRead
from app.services.message_service import (
    MessageNotFoundError,
    MessageValidationError,
    clear_all_messages,
    create_message,
    delete_conversation,
    list_messages_for_user,
    mark_message_as_read,
)


router = APIRouter()


def _tenant_scope(current_user: User, x_tenant_id: int | None) -> int:
    if current_user.is_super_admin:
        tenant_id = x_tenant_id or current_user.tenant_id
    else:
        tenant_id = current_user.tenant_id
        if x_tenant_id is not None and tenant_id is not None and int(x_tenant_id) != int(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para ese tenant.",
            )
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )
    return int(tenant_id)


@router.get("", response_model=MessageListResponse, summary="Listar mensajes del usuario actual")
def api_list_messages(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> MessageListResponse:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    return list_messages_for_user(
        session=session,
        user=current_user,
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar un mensaje",
)
def api_create_message(
    payload: MessageCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> MessageRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return create_message(
            session=session,
            user=current_user,
            tenant_id=tenant_id,
            payload=payload,
        )
    except MessageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/{message_id}/read",
    response_model=MessageRead,
    summary="Marcar mensaje como leido",
)
def api_mark_message_read(
    message_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> MessageRead:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        return mark_message_as_read(
            session=session,
            user=current_user,
            tenant_id=tenant_id,
            message_id=message_id,
        )
    except MessageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except MessageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/conversation/{other_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Eliminar todos los mensajes de una conversacion",
)
def api_delete_conversation(
    other_user_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    try:
        delete_conversation(
            session=session,
            user=current_user,
            tenant_id=tenant_id,
            other_user_id=other_user_id,
        )
    except MessageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/clear-all",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Eliminar todos los mensajes del usuario actual",
)
def api_clear_all_messages(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    clear_all_messages(
        session=session,
        user=current_user,
        tenant_id=tenant_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
