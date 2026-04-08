import asyncio
from types import SimpleNamespace

import pytest

import app.api.v1.ai_chat as ai_chat
from app.api.v1.ai_chat import (
    HelpChatMessage,
    HelpChatRequest,
    _build_help_chat_response,
    _build_help_response,
    _help_system_prompt,
    help_chat,
    _load_help_knowledge,
    _load_synced_help_center_knowledge,
    _select_relevant_knowledge,
)
from app.ai.errors import AIUnavailableError
from app.core.config import settings


@pytest.fixture(autouse=True)
def _disable_help_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_help_llm_enabled", False)
    monkeypatch.setattr(ai_chat, "_HELP_LLM_DOWN_UNTIL", 0.0)


def _build_user() -> SimpleNamespace:
    return SimpleNamespace(
        full_name="Usuario Prueba",
        is_super_admin=False,
        roles=["usuario"],
        role_name="usuario",
    )


def test_ai_help_recovers_work_reports_for_parte_de_obra_queries() -> None:
    knowledge = _select_relevant_knowledge("donde puedo ver un parte de obra")

    assert "## Partes de Trabajo" in knowledge
    assert "### Crear un Parte de Trabajo" in knowledge or "### Navegar entre Partes" in knowledge
    assert "Nuevo Parte" in knowledge or "partes de trabajo" in knowledge.lower()


def test_ai_help_recovers_economic_analysis_for_parte_economico_queries() -> None:
    knowledge = _select_relevant_knowledge("que analiza el parte economico")

    assert "analisis economico" in knowledge.lower()
    assert "mano de obra" in knowledge
    assert "subcontratas" in knowledge


def test_ai_help_loads_synced_help_center_knowledge_from_frontend_source() -> None:
    knowledge = _load_synced_help_center_knowledge()

    assert "## Catalogo sincronizado desde HelpCenter" in knowledge
    assert "## Partes de Trabajo" in knowledge
    assert "### Crear un Parte de Trabajo" in knowledge
    assert "### Inventario de Obra" in knowledge


def test_ai_help_combines_synced_help_center_and_deep_knowledge() -> None:
    knowledge = _load_help_knowledge()

    assert "## Catalogo sincronizado desde HelpCenter" in knowledge
    assert "## Mapa de entrada rapido" in knowledge
    assert "Ajustes > `Gestion de usuarios`" in knowledge


def test_help_system_prompt_includes_inventory_route_when_user_asks_for_it() -> None:
    prompt = _help_system_prompt(
        _build_user(),
        [HelpChatMessage(role="user", content="donde esta el inventario de una obra")],
    )

    assert "inventario" in prompt.lower()
    assert "#/work-management/{workId}?tab=inventory" in prompt
    assert "Los enlaces deben ir en formato `[texto](#/ruta)`" in prompt


def test_build_help_response_for_create_part_query() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como crear un parte")],
    )

    assert "[Inicio](#/)" in response
    assert "Pulsar `+ Nuevo Parte`" in response
    assert "Guardar con el estado que corresponda" in response


def test_build_help_response_for_inventory_query() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="donde esta el inventario")],
    )

    assert "[Obras](#/projects)" in response
    assert "Entrar en `Inventario`" in response


def test_build_help_response_for_file_sharing_query_uses_chat_ui() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como compartir archivos")],
    )

    assert "icono de mensajes del header" in response
    assert "icono del clip" in response
    assert "Más opciones" in response


def test_build_help_response_for_settings_query_uses_current_tabs() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como entrar en ajustes")],
    )

    assert "engranaje superior del header" in response
    assert "Gestion de usuarios" in response
    assert "Ayuda" in response


def test_build_help_response_for_help_query_points_to_settings_help_tab() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="donde esta ayuda")],
    )

    assert "engranaje superior del header" in response
    assert "pestaña `Ayuda`" in response


def test_build_help_response_for_language_query_uses_mobile_menu() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="donde cambio el idioma")],
    )

    assert "Más opciones" in response
    assert "Español" in response
    assert "English" in response


def test_build_help_response_for_organization_query_acknowledges_missing_visible_tab() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como configurar la organizacion")],
    )

    assert "no veo una pestaña independiente de `Organización`" in response
    assert "Perfil" in response
    assert "Gestion de usuarios" in response


def test_build_help_response_for_calendar_query_is_cautious_about_current_ui() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como gestionar tareas en el calendario")],
    )

    assert "Más opciones" in response
    assert "no veo una ruta principal pública para el calendario" in response


def test_build_help_response_keeps_previous_topic_for_mobile_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde estan los mensajes"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y en movil?"),
        ],
    )

    assert "icono de mensajes del header" in response
    assert "`M\u00e1s opciones`" in response


def test_build_help_response_switches_topic_on_explicit_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde estan los mensajes"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y las notificaciones?"),
        ],
    )

    assert "campana del header" in response
    assert "icono de mensajes del header" not in response


def test_build_help_response_uses_previous_context_for_help_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="como entrar en ajustes"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y ayuda?"),
        ],
    )

    assert "pesta\u00f1a `Ayuda`" in response
    assert "engranaje superior del header" in response


def test_build_help_response_uses_previous_context_for_file_sharing_mobile_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="como compartir archivos"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y en movil?"),
        ],
    )

    assert "chat actual" in response
    assert "`M\u00e1s opciones`" in response


def test_build_help_response_uses_previous_context_for_role_follow_up_on_admin_area() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde esta gestion de usuarios"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y quien puede hacerlo?"),
        ],
    )

    assert "`super_admin`" in response
    assert "`tenant_admin`" in response
    assert "área administrativa" in response


def test_build_help_response_uses_previous_context_for_role_name_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde esta gestion de usuarios"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y con qu\u00e9 rol?"),
        ],
    )

    assert "`super_admin`" in response
    assert "`tenant_admin`" in response
    assert "área administrativa" in response


def test_build_help_response_uses_previous_context_for_role_follow_up_on_operational_area() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="como crear un parte"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y quien puede hacerlo?"),
        ],
    )

    assert "`super_admin`" in response
    assert "`tenant_admin`" in response
    assert "perfil operativo" in response
    assert "`usuario`" in response


def test_build_help_response_uses_previous_context_for_file_sharing_desktop_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="como compartir archivos"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y en escritorio?"),
        ],
    )

    assert "chat actual" in response
    assert "En escritorio se hace igual" in response


def test_build_help_chat_response_uses_ollama_when_candidate_is_safe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_help_llm_enabled", True)
    monkeypatch.setattr(settings, "ollama_help_model", "qwen3-coder:30b")
    monkeypatch.setattr(
        ai_chat.OllamaClient,
        "generate_text",
        lambda self, *args, **kwargs: (
            "Abre [Inicio](#/) y entra en la pestaña `Partes de trabajo`.\n\n"
            "1. Pulsa `+ Nuevo Parte`.\n"
            "2. Completa los datos y guarda el estado que corresponda."
        ),
    )

    response = _build_help_chat_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como crear un parte")],
    )

    assert response.startswith("Abre [Inicio](#/)")
    assert "Pulsa `+ Nuevo Parte`" in response


def test_build_help_chat_response_falls_back_when_ollama_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_help_llm_enabled", True)
    monkeypatch.setattr(settings, "ollama_help_model", "qwen3-coder:30b")

    def _raise_unavailable(self, *args, **kwargs):
        raise AIUnavailableError("sin conexion")

    monkeypatch.setattr(ai_chat.OllamaClient, "generate_text", _raise_unavailable)

    response = _build_help_chat_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como crear un parte")],
    )

    assert "[Inicio](#/)" in response
    assert "Pulsar `+ Nuevo Parte`" in response


def test_build_help_chat_response_falls_back_when_ollama_adds_unknown_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_help_llm_enabled", True)
    monkeypatch.setattr(settings, "ollama_help_model", "qwen3-coder:30b")
    monkeypatch.setattr(
        ai_chat.OllamaClient,
        "generate_text",
        lambda self, *args, **kwargs: "Ve a [Panel oculto](#/admin-secret) para crear el parte.",
    )

    response = _build_help_chat_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como crear un parte")],
    )

    assert "[Inicio](#/)" in response
    assert "#/admin-secret" not in response


async def _read_streaming_response(response) -> str:
    chunks: list[str] = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk.decode("utf-8"))
        else:
            chunks.append(chunk)
    return "".join(chunks)


def test_help_chat_streams_sse_without_external_ai() -> None:
    response = asyncio.run(
        help_chat(
            HelpChatRequest(
                messages=[HelpChatMessage(role="user", content="donde puedo ver un parte de obra")]
            ),
            current_user=_build_user(),
        )
    )

    body = asyncio.run(_read_streaming_response(response))

    assert response.media_type == "text/event-stream"
    assert "data:" in body
    assert "[DONE]" in body
    assert "[Inicio](#/)" in body
    assert "Partes de trabajo" in body
