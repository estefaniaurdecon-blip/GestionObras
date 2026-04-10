import asyncio
from types import SimpleNamespace

import pytest

import app.api.v1.ai_chat as ai_chat
from app.ai.errors import AIUnavailableError
from app.api.v1.ai_chat import (
    HelpChatMessage,
    HelpChatRequest,
    _build_help_chat_response,
    _build_help_response,
    _help_system_prompt,
    _load_help_knowledge,
    _load_synced_help_center_knowledge,
    _select_relevant_knowledge,
    help_chat,
)
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

    assert "partes de trabajo" in knowledge.lower()
    assert "## Modulo: partes" in knowledge or "## Partes de Trabajo" in knowledge


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


def test_ai_help_combines_android_faq_help_center_and_deep_knowledge() -> None:
    knowledge = _load_help_knowledge()

    assert "## Fuente prioritaria" in knowledge
    assert "## Catalogo sincronizado desde HelpCenter" in knowledge
    assert "## Mapa de entrada rapido" in knowledge
    assert "Ajustes > `Gestion de usuarios`" in knowledge


def test_intent_catalog_loads_android_faq_and_help_center_entries() -> None:
    intents = ai_chat._intent_catalog()

    assert len(intents) >= 20
    assert any(intent["source"] == "android_faq_intent" for intent in intents)
    assert any(intent["source"] == "help_center_intent" for intent in intents)


def test_intent_catalog_entries_have_stable_ids_and_aliases() -> None:
    intents = ai_chat._intent_catalog()

    assert all(intent.get("intent_id") for intent in intents)
    assert all(isinstance(intent.get("aliases"), list) for intent in intents)
    assert any(intent.get("aliases") for intent in intents)


def test_android_faq_intents_match_their_own_generated_probes() -> None:
    failures: list[str] = []

    for entry in ai_chat._parse_android_faq_intents():
        expected_id = str(entry.get("intent_id", ""))
        for probe in ai_chat._intent_probe_queries(entry):
            matched = ai_chat._best_matching_intent(probe)
            matched_id = str((matched or {}).get("intent_id", ""))
            if matched_id != expected_id:
                matched_question = matched.get("question") if matched else None
                failures.append(
                    f"probe={probe!r} expected={entry.get('question')!r} got={matched_question!r}"
                )

    assert not failures, "\n".join(failures[:20])


def test_help_system_prompt_includes_android_faq_priority_and_inventory_route() -> None:
    prompt = _help_system_prompt(
        _build_user(),
        [HelpChatMessage(role="user", content="donde esta el inventario de una obra")],
    )

    assert "inventario" in prompt.lower()
    assert "#/work-management/{workId}?tab=inventory" in prompt
    assert "Los enlaces deben ir en formato `[texto](#/ruta)`" in prompt
    assert "FAQ de la app Android" in prompt
    assert "LECTURA DE DOCUMENTO O IMAGEN" in prompt


def test_build_help_response_for_create_part_query_prioritizes_android_faq() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como crear un parte")],
    )

    assert "Partes de trabajo" in response
    assert "`Generar parte`" in response
    assert "datos requeridos del dia" in ai_chat._normalize_search_text(response)


def test_build_help_response_for_search_part_query_uses_history_instead_of_creation_flow() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como puedo buscar un parte de trabajo")],
    )

    normalized = ai_chat._normalize_search_text(response)

    assert "historial de partes" in normalized
    assert "filtros" in normalized
    assert "generar parte" not in normalized


def test_build_help_response_for_search_part_query_with_typos_still_uses_history() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="komo busko un parte antiguoo de travajo")],
    )

    normalized = ai_chat._normalize_search_text(response)

    assert "historial de partes" in normalized
    assert "filtros" in normalized
    assert "generar parte" not in normalized


def test_build_help_response_for_create_part_query_with_typos_still_uses_creation_flow() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="komo pueod acer un parte de travajo nuevo")],
    )

    normalized = ai_chat._normalize_search_text(response)

    assert "generar parte" in normalized
    assert "historial de partes" not in normalized


def test_build_help_response_for_inventory_query_uses_work_context() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="donde esta el inventario")],
    )

    assert "obra concreta" in response
    assert "`Inventario`" in response
    assert "`Dashboard`, `Albaranes`, `Materiales` y `Herramientas`" in response


def test_build_help_response_for_inventory_query_with_typos_still_uses_work_context() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="dnde sta el inventrio de una obra")],
    )

    normalized = ai_chat._normalize_search_text(response)

    assert "obra concreta" in normalized
    assert "inventario" in normalized


def test_build_help_response_for_economic_analysis_export_query_uses_catalog_intent() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="Hola! Como puedo descargar datos de analisis economico?")],
    )

    normalized = ai_chat._normalize_search_text(response)

    assert "gestion economica" in normalized
    assert "analisis" in normalized
    assert "excel" in normalized or "pdf" in normalized
    assert "partes de trabajo" not in normalized


def test_best_matching_intent_prefers_specific_help_center_export_title() -> None:
    matched = ai_chat._best_matching_intent("Exportar Partes (PDF y Excel)")

    assert matched is not None
    assert matched["source"] == "help_center_intent"
    assert matched["question"] == "Exportar Partes (PDF y Excel)"


def test_best_matching_intent_prefers_specific_help_center_radar_view_title() -> None:
    matched = ai_chat._best_matching_intent("Radar de Obras Vista de Radar")

    assert matched is not None
    assert matched["source"] == "help_center_intent"
    assert matched["question"] == "Vista de Radar"


def test_best_matching_intent_prefers_specific_help_center_cartera_title() -> None:
    matched = ai_chat._best_matching_intent("Cartera de Empresas")

    assert matched is not None
    assert matched["source"] == "help_center_intent"
    assert matched["question"] == "Cartera de Empresas"


def test_build_help_response_for_file_sharing_query_is_cautious_when_not_in_faq() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como compartir archivos")],
    )

    assert "No veo un flujo confirmado" in response
    assert "burbuja flotante" in response
    assert "[centro de ayuda](#/settings/help?tab=faq)" in response


def test_build_help_response_for_settings_query_stays_within_faq_scope() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como entrar en ajustes")],
    )

    assert "`Ajustes`" in response
    assert "cabecera principal" in response
    assert "prefiero no inventarlas" in response


def test_build_help_response_for_help_query_points_to_ai_help_conversation() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="donde esta ayuda")],
    )

    assert "Ayuda IA" in response
    assert "conversacion especial" in response
    assert "burbuja flotante" in response


def test_build_help_response_for_language_query_admits_missing_faq_detail() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="donde cambio el idioma")],
    )

    assert "No veo un cambio de idioma documentado" in response
    assert "[centro de ayuda](#/settings/help?tab=faq)" in response


def test_build_help_response_for_organization_query_acknowledges_missing_faq_detail() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como configurar la organizacion")],
    )

    assert "No veo una pantalla de organizacion" in response
    assert "`Ajustes` existe" in response


def test_build_help_response_for_calendar_query_is_cautious_about_missing_faq() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="como gestionar tareas en el calendario")],
    )

    assert "No veo un flujo de calendario documentado" in response
    assert "[centro de ayuda](#/settings/help?tab=faq)" in response


def test_fallback_help_response_derives_to_help_center_and_faq() -> None:
    response = _build_help_response(
        _build_user(),
        [HelpChatMessage(role="user", content="explicame algo rarisimo que no exista en la app")],
    )

    assert "No puedo responder eso con suficiente precision" in response
    assert "[centro de ayuda](#/settings/help?tab=faq)" in response
    assert "`FAQ`" in response


def test_build_help_response_keeps_previous_topic_for_mobile_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde estan los mensajes"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y en movil?"),
        ],
    )

    assert "burbuja flotante" in response
    assert "Android" in response


def test_build_help_response_switches_topic_on_explicit_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde estan los mensajes"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y las notificaciones?"),
        ],
    )

    assert "campana" in response.lower()
    assert "Marcar todas" in response
    assert "burbuja flotante" not in response


def test_build_help_response_uses_previous_context_for_help_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="como entrar en ajustes"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y ayuda?"),
        ],
    )

    assert "Ayuda IA" in response
    assert "conversacion especial" in response


def test_build_help_response_uses_previous_context_for_file_sharing_mobile_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="como compartir archivos"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y en movil?"),
        ],
    )

    assert "No veo un flujo confirmado" in response
    assert "Android" in response


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
    assert "area administrativa" in ai_chat._normalize_search_text(response)


def test_build_help_response_uses_previous_context_for_role_name_follow_up() -> None:
    response = _build_help_response(
        _build_user(),
        [
            HelpChatMessage(role="user", content="donde esta gestion de usuarios"),
            HelpChatMessage(role="assistant", content="respuesta previa"),
            HelpChatMessage(role="user", content="y con que rol?"),
        ],
    )

    assert "`super_admin`" in response
    assert "`tenant_admin`" in response
    assert "area administrativa" in ai_chat._normalize_search_text(response)


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
    assert "perfil operativo" in ai_chat._normalize_search_text(response)
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

    assert "No veo un flujo confirmado" in response
    assert "flujo de escritorio" in response


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

    assert "`Generar parte`" in response
    assert "datos requeridos del dia" in ai_chat._normalize_search_text(response)


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

    assert "`Generar parte`" in response
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
    assert "Partes de trabajo" in body
