from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings


router = APIRouter()
logger = logging.getLogger(__name__)

UpdatePlatform = Literal["windows", "android", "web"]
_VERSION_DIGITS_RE = re.compile(r"(\d+)")


class UpdateCheckRequest(BaseModel):
    currentVersion: str = Field(min_length=1, max_length=64)
    platform: UpdatePlatform

    @field_validator("currentVersion")
    @classmethod
    def validate_current_version(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("currentVersion is required")
        return normalized


class UpdateCatalogEntry(BaseModel):
    platform: UpdatePlatform
    version: str = Field(min_length=1, max_length=64)
    downloadUrl: str | None = Field(default=None, max_length=2048)
    fileSize: int | None = Field(default=None, ge=0)
    releaseNotes: str | None = None
    isMandatory: bool = False
    disabled: bool = False

    @field_validator("version")
    @classmethod
    def validate_version(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("version is required")
        return normalized


class UpdateCheckResponse(BaseModel):
    updateAvailable: bool
    version: str | None = None
    downloadUrl: str | None = None
    fileSize: int | None = None
    releaseNotes: str | None = None
    isMandatory: bool = False
    message: str | None = None


def _version_tokens(version: str) -> list[int]:
    cleaned = version.strip().lstrip("vV")
    if not cleaned:
        return [0]

    tokens: list[int] = []
    for chunk in cleaned.split("."):
        match = _VERSION_DIGITS_RE.search(chunk)
        tokens.append(int(match.group(1)) if match else 0)
    return tokens


def _version_sort_key(version: str, size: int = 6) -> tuple[int, ...]:
    tokens = _version_tokens(version)
    if len(tokens) < size:
        tokens.extend([0] * (size - len(tokens)))
    return tuple(tokens[:size])


def _is_newer_version(candidate: str, current: str) -> bool:
    candidate_tokens = _version_tokens(candidate)
    current_tokens = _version_tokens(current)
    size = max(len(candidate_tokens), len(current_tokens), 3)
    candidate_tokens.extend([0] * (size - len(candidate_tokens)))
    current_tokens.extend([0] * (size - len(current_tokens)))
    return tuple(candidate_tokens) > tuple(current_tokens)


def _load_catalog_entries() -> list[UpdateCatalogEntry]:
    raw_catalog = settings.app_updates_catalog_json
    if not raw_catalog:
        return []

    try:
        parsed_catalog: Any = json.loads(raw_catalog)
    except json.JSONDecodeError as exc:
        logger.error("APP_UPDATES_CATALOG_JSON has invalid JSON: %s", exc)
        return []

    if not isinstance(parsed_catalog, list):
        logger.error("APP_UPDATES_CATALOG_JSON must be a JSON array")
        return []

    entries: list[UpdateCatalogEntry] = []
    for index, raw_entry in enumerate(parsed_catalog):
        try:
            entries.append(UpdateCatalogEntry.model_validate(raw_entry))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping invalid update catalog entry #%s: %s", index, exc)
    return entries


@router.post("/check", response_model=UpdateCheckResponse)
def check_updates(payload: UpdateCheckRequest) -> UpdateCheckResponse:
    catalog_entries = _load_catalog_entries()

    disabled_versions = {
        version.strip()
        for version in settings.app_updates_disabled_versions
        if isinstance(version, str) and version.strip()
    }

    platform_entries = [
        entry
        for entry in catalog_entries
        if entry.platform == payload.platform
        and not entry.disabled
        and entry.version not in disabled_versions
    ]

    if not platform_entries:
        return UpdateCheckResponse(
            updateAvailable=False,
            message="No versions found for this platform",
        )

    latest_entry = max(platform_entries, key=lambda entry: _version_sort_key(entry.version))

    if _is_newer_version(latest_entry.version, payload.currentVersion):
        return UpdateCheckResponse(
            updateAvailable=True,
            version=latest_entry.version,
            downloadUrl=latest_entry.downloadUrl,
            fileSize=latest_entry.fileSize,
            releaseNotes=latest_entry.releaseNotes,
            isMandatory=latest_entry.isMandatory,
        )

    return UpdateCheckResponse(
        updateAvailable=False,
        message="You are using the latest version",
    )

