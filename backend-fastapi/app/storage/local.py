from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import settings


def build_invoice_path(
    tenant_id: int,
    invoice_id: int,
    original_filename: Optional[str],
) -> Path:
    """Construye la ruta final del archivo en el disco compartido."""
    ext = ".pdf"
    if original_filename and "." in original_filename:
        ext = f".{original_filename.rsplit('.', 1)[1].lower()}"
    base = Path(settings.invoices_storage_path)
    return base / f"tenant_{tenant_id}" / f"{invoice_id}{ext}"


def save_upload_to_disk(
    upload: UploadFile,
    tenant_id: int,
    invoice_id: int,
) -> Path:
    """
    Guarda el fichero subido en el disco local del contenedor.
    """
    target_path = build_invoice_path(tenant_id, invoice_id, upload.filename)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    with target_path.open("wb") as f:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return target_path


def delete_invoice_file(file_path: str) -> None:
    """
    Elimina el archivo local si existe.
    """
    path = Path(file_path)
    if path.exists():
        path.unlink()


def build_avatar_path(user_id: int, extension: str) -> Path:
    """
    Construye la ruta final del avatar en el disco.
    """
    base = Path(settings.avatars_storage_path)
    return base / f"user_{user_id}.{extension}"


def save_avatar_to_disk(upload: UploadFile, user_id: int, extension: str) -> Path:
    """
    Guarda el avatar subido en el disco local.
    """
    target_path = build_avatar_path(user_id, extension)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    with target_path.open("wb") as f:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return target_path


def build_logo_path(tenant_id: int, extension: str) -> Path:
    """
    Construye la ruta final del logo en el disco.
    """
    base = Path(settings.logos_storage_path)
    return base / f"tenant_{tenant_id}.{extension}"


def save_logo_to_disk(upload: UploadFile, tenant_id: int, extension: str) -> Path:
    """
    Guarda el logo subido en el disco local.
    """
    target_path = build_logo_path(tenant_id, extension)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    upload.file.seek(0)

    with target_path.open("wb") as f:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return target_path


def build_project_doc_path(project_id: int, extension: str) -> Path:
    """
    Construye la ruta final del documento del proyecto en el disco.
    """
    base = Path(settings.project_docs_storage_path)
    file_id = uuid4().hex
    return base / f"project_{project_id}_{file_id}.{extension}"


def save_project_doc_to_disk(upload: UploadFile, project_id: int, extension: str) -> Path:
    """
    Guarda un documento de proyecto en el disco local.
    """
    target_path = build_project_doc_path(project_id, extension)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    upload.file.seek(0)

    with target_path.open("wb") as f:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return target_path
