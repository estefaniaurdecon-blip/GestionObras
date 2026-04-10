import httpx

from app.ai.client import OllamaClient, _candidate_base_urls
from app.ai.errors import AIUnavailableError
from app.core.config import settings


def test_candidate_base_urls_expand_local_hosts() -> None:
    urls = _candidate_base_urls("http://host.docker.internal:11434")

    assert urls == [
        "http://host.docker.internal:11434",
        "http://localhost:11434",
        "http://127.0.0.1:11434",
    ]


def test_ollama_client_falls_back_to_localhost_when_primary_host_fails(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "ollama_base_url", "http://host.docker.internal:11434")
    monkeypatch.setattr(settings, "ollama_headers_json", None)

    attempts: list[str] = []

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, json=None, headers=None):
            attempts.append(url)
            request = httpx.Request("POST", url)
            if "host.docker.internal" in url:
                raise httpx.ConnectError("sin conexion", request=request)
            return httpx.Response(200, request=request, json={"response": "respuesta ok"})

    monkeypatch.setattr("app.ai.client.httpx.Client", FakeClient)

    client = OllamaClient()
    response = client.generate_text("hola", model="modelo-prueba")

    assert response == "respuesta ok"
    assert attempts == [
        "http://host.docker.internal:11434/api/generate",
        "http://localhost:11434/api/generate",
    ]
    assert client.base_url == "http://localhost:11434"


def test_ollama_client_raises_when_all_candidates_fail(monkeypatch) -> None:
    monkeypatch.setattr(settings, "ollama_base_url", "http://host.docker.internal:11434")
    monkeypatch.setattr(settings, "ollama_headers_json", None)

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def post(self, url: str, json=None, headers=None):
            raise httpx.ConnectError("sin conexion", request=httpx.Request("POST", url))

    monkeypatch.setattr("app.ai.client.httpx.Client", FakeClient)

    client = OllamaClient()

    try:
        client.generate_text("hola", model="modelo-prueba")
    except AIUnavailableError as exc:
        assert "127.0.0.1" in str(exc)
    else:
        raise AssertionError("Se esperaba AIUnavailableError cuando fallan todos los hosts")


def test_ollama_health_check_uses_fallback_hosts(monkeypatch) -> None:
    monkeypatch.setattr(settings, "ollama_base_url", "http://host.docker.internal:11434")
    monkeypatch.setattr(settings, "ollama_headers_json", None)

    attempts: list[str] = []

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def get(self, url: str, headers=None):
            attempts.append(url)
            request = httpx.Request("GET", url)
            if "host.docker.internal" in url:
                raise httpx.ConnectError("sin conexion", request=request)
            return httpx.Response(200, request=request, json={"models": []})

    monkeypatch.setattr("app.ai.client.httpx.Client", FakeClient)

    client = OllamaClient()

    assert client.health_check() is True
    assert attempts == [
        "http://host.docker.internal:11434/api/tags",
        "http://localhost:11434/api/tags",
    ]
    assert client.base_url == "http://localhost:11434"
