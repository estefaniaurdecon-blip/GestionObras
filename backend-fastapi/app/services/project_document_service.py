from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from sqlmodel import Session, select

from app.models.erp import ProjectDocument
from app.services.erp_service import get_project
from app.storage.local import save_project_doc_to_disk


def _extension_from_upload(upload: UploadFile) -> str:
    content_type = getattr(upload, "content_type", None) or ""
    filename = (upload.filename or "").lower()
    ext_map = {
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.ms-powerpoint": "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "text/plain": "txt",
    }
    extension = ext_map.get(content_type)
    if not extension and "." in filename:
        extension = filename.rsplit(".", 1)[-1]
    if extension == "jpeg":
        extension = "jpg"
    if not extension:
        extension = "bin"
    return extension


def list_project_documents(
    session: Session,
    project_id: int,
    tenant_id: Optional[int],
    doc_type: Optional[str] = None,
) -> list[ProjectDocument]:
    get_project(session, project_id, tenant_id)
    stmt = select(ProjectDocument).where(ProjectDocument.project_id == project_id)
    if tenant_id is not None:
        stmt = stmt.where(ProjectDocument.tenant_id == tenant_id)
    if doc_type:
        stmt = stmt.where(ProjectDocument.doc_type == doc_type)
    return session.exec(stmt.order_by(ProjectDocument.uploaded_at.desc())).all()


def create_project_document(
    session: Session,
    project_id: int,
    upload: UploadFile,
    tenant_id: Optional[int],
    doc_type: str,
) -> ProjectDocument:
    project = get_project(session, project_id, tenant_id)
    resolved_tenant = tenant_id if tenant_id is not None else project.tenant_id
    if resolved_tenant is None:
        raise ValueError("Tenant requerido para subir documentos del proyecto")
    if not doc_type:
        doc_type = "otros"

    extension = _extension_from_upload(upload)
    target_path = save_project_doc_to_disk(upload, project_id, extension)
    size_bytes = target_path.stat().st_size

    doc = ProjectDocument(
        tenant_id=resolved_tenant,
        project_id=project_id,
        doc_type=doc_type,
        file_name=target_path.name,
        original_name=upload.filename or target_path.name,
        content_type=getattr(upload, "content_type", None) or "application/octet-stream",
        size_bytes=size_bytes,
        uploaded_at=datetime.utcnow(),
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc
