import json

from fastapi import status
from fastapi.testclient import TestClient

from app.core.config import settings


def _set_update_catalog(monkeypatch, catalog, disabled_versions=None) -> None:
    monkeypatch.setattr(
        settings,
        "app_updates_catalog_json",
        json.dumps(catalog) if catalog is not None else None,
    )
    monkeypatch.setattr(
        settings,
        "app_updates_disabled_versions",
        disabled_versions or [],
    )


def test_check_updates_returns_no_update_without_catalog(
    client: TestClient,
    monkeypatch,
) -> None:
    _set_update_catalog(monkeypatch, catalog=None)

    response = client.post(
        "/api/v1/updates/check",
        json={"currentVersion": "2.0.1", "platform": "android"},
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["updateAvailable"] is False
    assert payload["message"] == "No versions found for this platform"


def test_check_updates_returns_latest_enabled_version(
    client: TestClient,
    monkeypatch,
) -> None:
    catalog = [
        {
            "platform": "android",
            "version": "2.0.2",
            "downloadUrl": "https://downloads.example.com/app-2.0.2.apk",
            "fileSize": 100,
            "releaseNotes": "Bug fixes",
            "isMandatory": False,
        },
        {
            "platform": "android",
            "version": "2.1.0",
            "downloadUrl": "https://downloads.example.com/app-2.1.0.apk",
            "fileSize": 200,
            "releaseNotes": "New features",
            "isMandatory": True,
        },
    ]
    _set_update_catalog(monkeypatch, catalog=catalog)

    response = client.post(
        "/api/v1/updates/check",
        json={"currentVersion": "2.0.1", "platform": "android"},
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["updateAvailable"] is True
    assert payload["version"] == "2.1.0"
    assert payload["downloadUrl"] == "https://downloads.example.com/app-2.1.0.apk"
    assert payload["isMandatory"] is True


def test_check_updates_skips_disabled_versions(
    client: TestClient,
    monkeypatch,
) -> None:
    catalog = [
        {
            "platform": "windows",
            "version": "2.0.9",
            "downloadUrl": "https://downloads.example.com/app-2.0.9.exe",
        },
        {
            "platform": "windows",
            "version": "2.1.0",
            "downloadUrl": "https://downloads.example.com/app-2.1.0.exe",
        },
    ]
    _set_update_catalog(monkeypatch, catalog=catalog, disabled_versions=["2.1.0"])

    response = client.post(
        "/api/v1/updates/check",
        json={"currentVersion": "2.0.0", "platform": "windows"},
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["updateAvailable"] is True
    assert payload["version"] == "2.0.9"
