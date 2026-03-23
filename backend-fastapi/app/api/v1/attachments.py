from __future__ import annotations

import mimetypes
import re
from datetime import datetime
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, select
from starlette.responses import FileResponse

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.db.session import get_session
from app.models.attachments import SharedFile, WorkReportAttachment
from app.models.user import User
from app.services.user_service import resolve_creator_group_id, users_share_creation_group


router = APIRouter()

_SAFE_CATEGORY = re.compile(r"[^a-z0-9_-]+")
_SAFE_ENTITY = re.compile(r"[^a-zA-Z0-9._-]+")


class AttachmentDescriptionUpdate(BaseModel):
    description: str | None = None


class GenericImageDeleteRequest(BaseModel):
    url: str


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


def _sanitize_filename(name: str | None, fallback: str = "file") -> str:
    value = (name or "").strip()
    if not value:
        value = fallback
    value = Path(value).name
    value = re.sub(r"[^a-zA-Z0-9._-]+", "_", value)
    return value or fallback


def _load_numeric_user(session: Session, user_id: str) -> User | None:
    if not user_id.isdigit():
        return None
    return session.get(User, int(user_id))


def _is_shared_file_visible_to_user_group(
    session: Session,
    current_user: User,
    row: SharedFile,
) -> bool:
    current_user_id = str(current_user.id)
    other_user_id = row.to_user_id if row.from_user_id == current_user_id else row.from_user_id
    other_user = _load_numeric_user(session, other_user_id)
    return users_share_creation_group(session, current_user, other_user)


def _safe_content_type(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").strip().lower()
    if not content_type:
        return "application/octet-stream"
    return content_type


def _guess_extension(upload: UploadFile) -> str:
    content_type = _safe_content_type(upload)
    guessed = mimetypes.guess_extension(content_type) or ""
    if guessed:
        return guessed.lstrip(".").lower()

    filename = _sanitize_filename(upload.filename, "file")
    if "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    return "bin"


def _ensure_in_dir(base_dir: Path, candidate: Path) -> Path:
    base_resolved = base_dir.resolve()
    candidate_resolved = candidate.resolve()
    if not str(candidate_resolved).startswith(str(base_resolved)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ruta de archivo no valida.",
        )
    return candidate_resolved


def _get_report_or_403(
    session: Session,
    work_report_id: int,
    tenant_id: int,
    current_user: User,
) -> "WorkReport":
    """
    Fase 1: valida existencia + pertenencia al tenant.
    Fase 2d: valida acceso por grupo (Opción B).
    Devuelve 404 para errores de existencia/tenant (no revela existencia cross-tenant).
    Devuelve 403 para errores de acceso de grupo.
    Partes legacy con creator_group_id=NULL son solo accesibles por super_admin.
    """
    from app.models.erp import WorkReport  # importación local para evitar circular

    report = session.get(WorkReport, work_report_id)
    if not report or report.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parte no encontrado.")
    # Fase 2d: filtro de grupo
    if not current_user.is_super_admin:
        if report.creator_group_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a este parte.")
        user_group = resolve_creator_group_id(session, current_user, persist=True)
        if user_group != report.creator_group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a este parte.")
    return report


def _ensure_work_report_image_access(
    session: Session,
    tenant_id: int,
    current_user: User,
    file_path: str,
) -> None:
    attachment = session.exec(
        select(WorkReportAttachment).where(
            WorkReportAttachment.tenant_id == tenant_id,
            WorkReportAttachment.file_path == file_path,
        )
    ).first()
    if attachment is None:
        return
    _get_report_or_403(session, attachment.work_report_id, tenant_id, current_user)


def _write_upload(upload: UploadFile, target_path: Path) -> int:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    upload.file.seek(0)
    total_bytes = 0
    with target_path.open("wb") as stream:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            stream.write(chunk)
            total_bytes += len(chunk)
    return total_bytes


_WORK_IMAGE_MARKERS = (
    "/static/work-report-images/",
    "/api/v1/work-reports/images/",
)


def _extract_relative_path_from_image_url(url: str) -> str | None:
    parsed = urlparse(url.strip())
    for marker in _WORK_IMAGE_MARKERS:
        index = parsed.path.find(marker)
        if index >= 0:
            return parsed.path[index + len(marker):].lstrip("/")
    return None


def _work_image_public_url(request: Request, relative_path: str) -> str:
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/api/v1/work-reports/images/{relative_path}"


def _serialize_work_report_attachment(attachment: WorkReportAttachment) -> dict:
    return {
        "id": attachment.id,
        "work_report_id": attachment.work_report_id,
        "image_url": attachment.image_url,
        "description": attachment.description,
        "display_order": attachment.display_order,
        "created_at": attachment.created_at.isoformat(),
        "updated_at": attachment.updated_at.isoformat(),
        "created_by": attachment.created_by,
    }


def _serialize_shared_file(session: Session, row: SharedFile) -> dict:
    user_name_by_id: dict[str, str] = {}
    for value in {row.from_user_id, row.to_user_id}:
        if value.isdigit():
            user_obj = session.get(User, int(value))
            if user_obj:
                user_name_by_id[value] = user_obj.full_name
    return {
        "id": row.id,
        "file_name": row.file_name,
        "file_path": row.file_path,
        "file_size": row.file_size,
        "file_type": row.file_type,
        "from_user_id": row.from_user_id,
        "to_user_id": row.to_user_id,
        "work_report_id": row.work_report_id,
        "message": row.message,
        "downloaded": row.downloaded,
        "created_at": row.created_at.isoformat(),
        "from_user": {"full_name": user_name_by_id.get(row.from_user_id, row.from_user_id)},
        "to_user": {"full_name": user_name_by_id.get(row.to_user_id, row.to_user_id)},
    }


@router.get("/work-reports/{work_report_id}/attachments")
def list_work_report_attachments(
    work_report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> list[dict]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    _get_report_or_403(session, work_report_id, tenant_id, current_user)
    rows = session.exec(
        select(WorkReportAttachment)
        .where(
            WorkReportAttachment.tenant_id == tenant_id,
            WorkReportAttachment.work_report_id == work_report_id,
        )
        .order_by(WorkReportAttachment.display_order.asc(), WorkReportAttachment.created_at.asc())
    ).all()
    return [_serialize_work_report_attachment(row) for row in rows]


@router.post("/work-reports/{work_report_id}/attachments", status_code=status.HTTP_201_CREATED)
def create_work_report_attachment(
    request: Request,
    work_report_id: int,
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
    display_order: int | None = Form(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    _get_report_or_403(session, work_report_id, tenant_id, current_user)
    content_type = _safe_content_type(file)
    extension = _guess_extension(file)
    filename = _sanitize_filename(file.filename, "image")
    timestamp = int(datetime.utcnow().timestamp() * 1000)
    relative_path = (
        f"tenant_{tenant_id}/work-reports/{_sanitize_filename(str(work_report_id), 'work-report')}/"
        f"{timestamp}_{filename.rsplit('.', 1)[0]}.{extension}"
    )

    base_dir = Path(settings.work_report_images_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / relative_path)
    _write_upload(file, target)

    if display_order is None:
        max_order = session.exec(
            select(WorkReportAttachment.display_order)
            .where(
                WorkReportAttachment.tenant_id == tenant_id,
                WorkReportAttachment.work_report_id == work_report_id,
            )
            .order_by(WorkReportAttachment.display_order.desc())
            .limit(1)
        ).first()
        display_order = int(max_order) + 1 if max_order is not None else 0

    row = WorkReportAttachment(
        tenant_id=tenant_id,
        work_report_id=work_report_id,
        image_url=_work_image_public_url(request, relative_path),
        file_path=relative_path,
        file_name=filename,
        content_type=content_type,
        description=(description or "").strip() or None,
        display_order=int(display_order),
        created_by=str(current_user.id),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize_work_report_attachment(row)


@router.patch("/work-reports/{work_report_id}/attachments/{attachment_id}")
def update_work_report_attachment(
    work_report_id: int,
    attachment_id: str,
    payload: AttachmentDescriptionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    _get_report_or_403(session, work_report_id, tenant_id, current_user)
    row = session.exec(
        select(WorkReportAttachment).where(
            WorkReportAttachment.id == attachment_id,
            WorkReportAttachment.tenant_id == tenant_id,
            WorkReportAttachment.work_report_id == work_report_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adjunto no encontrado.")

    row.description = (payload.description or "").strip() or None
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize_work_report_attachment(row)


@router.delete(
    "/work-reports/{work_report_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_work_report_attachment(
    work_report_id: int,
    attachment_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    _get_report_or_403(session, work_report_id, tenant_id, current_user)
    row = session.exec(
        select(WorkReportAttachment).where(
            WorkReportAttachment.id == attachment_id,
            WorkReportAttachment.tenant_id == tenant_id,
            WorkReportAttachment.work_report_id == work_report_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adjunto no encontrado.")

    base_dir = Path(settings.work_report_images_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / row.file_path)
    if target.exists():
        target.unlink()

    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/work-reports/images/{file_path:path}")
def serve_work_report_image(
    file_path: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> FileResponse:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    tenant_prefix = f"tenant_{tenant_id}/"
    if not file_path.startswith(tenant_prefix):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a este archivo.")
    _ensure_work_report_image_access(session, tenant_id, current_user, file_path)
    base_dir = Path(settings.work_report_images_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / file_path)
    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagen no encontrada.")
    media_type, _ = mimetypes.guess_type(str(target))
    return FileResponse(
        path=target,
        media_type=media_type or "application/octet-stream",
        filename=target.name,
    )


@router.post("/attachments/images", status_code=status.HTTP_201_CREATED)
def upload_generic_image(
    request: Request,
    category: str = Form(...),
    entity_id: str = Form(...),
    image_type: str | None = Form(default=None),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict:
    del session
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    safe_category = _SAFE_CATEGORY.sub("_", category.strip().lower()) or "general"
    safe_entity = _SAFE_ENTITY.sub("_", entity_id.strip()) or "entity"
    safe_type = _SAFE_ENTITY.sub("_", (image_type or "image").strip().lower()) or "image"

    extension = _guess_extension(file)
    filename = _sanitize_filename(file.filename, "image")
    timestamp = int(datetime.utcnow().timestamp() * 1000)
    relative_path = (
        f"tenant_{tenant_id}/{safe_category}/{safe_entity}/"
        f"{safe_type}_{timestamp}_{filename.rsplit('.', 1)[0]}.{extension}"
    )
    base_dir = Path(settings.work_report_images_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / relative_path)
    file_size = _write_upload(file, target)

    return {
        "url": _work_image_public_url(request, relative_path),
        "file_path": relative_path,
        "file_size": file_size,
        "content_type": _safe_content_type(file),
    }


@router.delete("/attachments/images/by-url")
def delete_generic_image_by_url(
    payload: GenericImageDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    relative_path = _extract_relative_path_from_image_url(payload.url)
    if not relative_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL de imagen no valida.",
        )
    tenant_prefix = f"tenant_{tenant_id}/"
    if not relative_path.startswith(tenant_prefix):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para eliminar este archivo.",
        )
    _ensure_work_report_image_access(session, tenant_id, current_user, relative_path)

    base_dir = Path(settings.work_report_images_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / relative_path)
    deleted = False
    if target.exists():
        target.unlink()
        deleted = True
    return {"success": True, "deleted": deleted}


@router.get("/shared-files")
def list_shared_files(
    direction: Literal["sent", "received", "all"] = Query(default="all"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> list[dict]:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    current_user_id = str(current_user.id)

    statement = select(SharedFile).where(SharedFile.tenant_id == tenant_id)
    if direction == "sent":
        statement = statement.where(SharedFile.from_user_id == current_user_id)
    elif direction == "received":
        statement = statement.where(SharedFile.to_user_id == current_user_id)
    else:
        statement = statement.where(
            or_(
                SharedFile.from_user_id == current_user_id,
                SharedFile.to_user_id == current_user_id,
            )
        )
    rows = session.exec(statement.order_by(SharedFile.created_at.desc())).all()
    visible_rows = [row for row in rows if _is_shared_file_visible_to_user_group(session, current_user, row)]
    return [_serialize_shared_file(session, row) for row in visible_rows]


@router.post("/shared-files", status_code=status.HTTP_201_CREATED)
def create_shared_file(
    file: UploadFile = File(...),
    to_user_id: str = Form(...),
    message: str | None = Form(default=None),
    work_report_id: str | None = Form(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    from_user_id = str(current_user.id)
    normalized_to_user_id = (to_user_id or "").strip()
    if not normalized_to_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_user_id es obligatorio.")
    if not normalized_to_user_id.isdigit():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_user_id no valido.")

    target_user = session.get(User, int(normalized_to_user_id))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destinatario no encontrado.")
    if target_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Destinatario fuera del tenant.")
    if target_user.is_super_admin or not users_share_creation_group(session, current_user, target_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Destinatario fuera de tu grupo de creacion.",
        )

    filename = _sanitize_filename(file.filename, "file")
    extension = _guess_extension(file)
    timestamp = int(datetime.utcnow().timestamp() * 1000)
    relative_path = (
        f"tenant_{tenant_id}/{from_user_id}/"
        f"{timestamp}_{filename.rsplit('.', 1)[0]}.{extension}"
    )
    base_dir = Path(settings.shared_files_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / relative_path)
    file_size = _write_upload(file, target)

    row = SharedFile(
        tenant_id=tenant_id,
        file_name=filename,
        file_path=relative_path,
        file_size=file_size,
        file_type=_safe_content_type(file),
        from_user_id=from_user_id,
        to_user_id=normalized_to_user_id,
        work_report_id=(work_report_id or "").strip() or None,
        message=(message or "").strip() or None,
        downloaded=False,
        created_at=datetime.utcnow(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _serialize_shared_file(session, row)


def _load_shared_file_or_404(session: Session, shared_file_id: str, tenant_id: int) -> SharedFile:
    row = session.exec(
        select(SharedFile).where(
            SharedFile.id == shared_file_id,
            SharedFile.tenant_id == tenant_id,
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo compartido no encontrado.")
    return row


def _ensure_shared_file_access(session: Session, row: SharedFile, current_user: User) -> None:
    user_id = str(current_user.id)
    if row.from_user_id != user_id and row.to_user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado para este archivo.")
    if not _is_shared_file_visible_to_user_group(session, current_user, row):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Archivo fuera de tu grupo de creacion.",
        )


@router.get("/shared-files/{shared_file_id}/download")
def download_shared_file(
    shared_file_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> FileResponse:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    row = _load_shared_file_or_404(session, shared_file_id, tenant_id)
    _ensure_shared_file_access(session, row, current_user)

    base_dir = Path(settings.shared_files_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / row.file_path)
    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado en disco.")
    return FileResponse(
        path=target,
        media_type=row.file_type or "application/octet-stream",
        filename=row.file_name,
    )


@router.post("/shared-files/{shared_file_id}/mark-downloaded")
def mark_shared_file_downloaded(
    shared_file_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> dict:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    row = _load_shared_file_or_404(session, shared_file_id, tenant_id)
    current_user_id = str(current_user.id)
    _ensure_shared_file_access(session, row, current_user)
    if row.to_user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el destinatario puede marcar el archivo como descargado.",
        )
    row.downloaded = True
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"success": True}


@router.delete(
    "/shared-files/{shared_file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_shared_file(
    shared_file_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: int | None = Header(default=None, alias="X-Tenant-Id"),
) -> Response:
    tenant_id = _tenant_scope(current_user, x_tenant_id)
    row = _load_shared_file_or_404(session, shared_file_id, tenant_id)
    _ensure_shared_file_access(session, row, current_user)

    base_dir = Path(settings.shared_files_storage_path)
    target = _ensure_in_dir(base_dir, base_dir / row.file_path)
    if target.exists():
        target.unlink()
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
