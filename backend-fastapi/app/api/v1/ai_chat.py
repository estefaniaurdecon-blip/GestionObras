from __future__ import annotations

import json
from collections.abc import AsyncIterator
from functools import lru_cache
import logging
from pathlib import Path
import re
import time
from typing import Any, Literal
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai.client import OllamaClient
from app.ai.errors import AIClientError
from app.api.deps import get_current_active_user
from app.core.config import settings
from app.models.user import User


router = APIRouter()
_REPO_ROOT = Path(__file__).resolve().parents[4]
_KNOWLEDGE_PATH = Path(__file__).with_name("ai_help_knowledge.md")
_HELP_CATALOG_PATH = (
    _REPO_ROOT
    / "apps"
    / "construction-log"
    / "construction-log-supabase-local"
    / "src"
    / "content"
    / "helpCatalog.json"
)
_SEARCH_TOKEN_RE = re.compile(r"[a-z0-9]+")
_DEFAULT_KNOWLEDGE_SECTIONS = {
    "mapa de entrada rapido",
    "metodo de respuesta recomendado",
    "rutas reales",
    "navegacion principal",
    "reglas de respuesta",
    "catalogo sincronizado desde helpcenter",
}
_LEGACY_HELP_CATEGORY_IDS = {"office-role", "reader-role"}
_QUERY_SYNONYMS: dict[str, tuple[str, ...]] = {
    "parte de obra": (
        "partes de trabajo",
        "parte de trabajo",
        "nuevo parte",
        "historial de partes",
    ),
    "parte economico": (
        "analisis economico",
        "gestion economica",
        "informe economico",
        "costes",
        "informes guardados",
    ),
    "analisis economico": (
        "parte economico",
        "gestion economica",
        "informes avanzados",
        "informes guardados",
    ),
    "inventario": (
        "inventario de obra",
        "materiales",
        "herramientas",
        "albaranes",
        "recalcular desde partes",
    ),
    "obra": (
        "obras",
        "gestion de obra",
        "proyecto",
        "work-management",
    ),
    "repaso": (
        "repasos",
        "repasos de obra",
    ),
    "postventa": (
        "postventas",
        "post-venta",
        "garantia",
    ),
    "control de acceso": (
        "control de accesos",
        "registro de accesos",
        "nuevo registro",
    ),
    "ajustes": (
        "configuracion",
        "gestion de usuarios",
        "ayuda",
        "perfil",
    ),
}
_SEARCH_STOPWORDS = {
    "a",
    "al",
    "algo",
    "como",
    "con",
    "cual",
    "cuales",
    "de",
    "del",
    "donde",
    "el",
    "en",
    "es",
    "esta",
    "este",
    "hay",
    "la",
    "las",
    "lo",
    "los",
    "me",
    "mi",
    "para",
    "por",
    "puedo",
    "que",
    "se",
    "si",
    "un",
    "una",
}
_LIST_PREFIX_RE = re.compile(r"^\s*(?:-|\d+\.)\s+")
_MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(#/[^)]+\)")
_ROUTE_LITERAL_RE = re.compile(r"`(#/[^`]+)`")
_ROUTE_TARGET_RE = re.compile(r"#/[^\s)`\]]+")
_FOLLOWUP_PREFIXES = (
    "y ",
    "vale y ",
    "ok y ",
    "y si ",
    "y en ",
    "y desde ",
    "y para ",
    "entonces ",
    "y eso",
    "y esto",
    "y ahi",
    "y alli",
    "y aqui",
    "tambien ",
    "también ",
)
_FOLLOWUP_REFERENCE_TOKENS = {
    "eso",
    "esto",
    "ahi",
    "alli",
    "aqui",
    "movil",
    "escritorio",
    "desktop",
}
_LEGACY_ROLE_LEAKS = {
    "office-role",
    "reader-role",
    "foreman",
    "site_manager",
    "reader",
}


logger = logging.getLogger("app.ai_help")
_HELP_LLM_DOWN_UNTIL = 0.0


class HelpChatMessage(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(min_length=1, max_length=4000)


class HelpChatRequest(BaseModel):
    messages: list[HelpChatMessage] = Field(default_factory=list, max_length=30)


async def _stream_disabled_message() -> AsyncIterator[str]:
    message = (
        "El chat IA heredado de Supabase esta desactivado en modo DocInt-only. "
        "El flujo de escaneo de albaranes sigue operativo."
    )
    payload = {"choices": [{"delta": {"content": message}}]}
    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


async def _stream_text_message(message: str) -> AsyncIterator[str]:
    payload = {"choices": [{"delta": {"content": message}}]}
    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


def _normalized_role_names(user: User) -> list[str]:
    raw_roles = getattr(user, "roles", None)
    if isinstance(raw_roles, list):
        values = [str(role).strip() for role in raw_roles if str(role).strip()]
    else:
        role_name = str(getattr(user, "role_name", "") or "").strip()
        values = [role_name] if role_name else []
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(value)
    return unique


def _current_role_names(user: User) -> list[str]:
    normalized = {role.lower() for role in _normalized_role_names(user)}
    current: list[str] = []

    if getattr(user, "is_super_admin", False) or "super_admin" in normalized or "master" in normalized:
        current.append("super_admin")
    if "tenant_admin" in normalized or "admin" in normalized or "site_manager" in normalized:
        current.append("tenant_admin")
    if (
        "usuario" in normalized
        or "user" in normalized
        or "foreman" in normalized
        or "ofi" in normalized
        or "reader" in normalized
    ):
        current.append("usuario")

    if not current:
        current.append("super_admin" if getattr(user, "is_super_admin", False) else "usuario")

    return current


@lru_cache(maxsize=1)
def _load_help_knowledge_extra() -> str:
    try:
        return _KNOWLEDGE_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


@lru_cache(maxsize=1)
def _load_synced_help_center_knowledge() -> str:
    try:
        raw_catalog = json.loads(_HELP_CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""

    if not isinstance(raw_catalog, list):
        return ""

    output_lines = [
        "## Catalogo sincronizado desde HelpCenter",
        "- Este bloque se genera leyendo el catalogo funcional compartido del HelpCenter del frontend.",
        "- Si cambia una guia funcional del HelpCenter, este catalogo cambia automaticamente para Ayuda IA.",
    ]

    for category in raw_catalog:
        if not isinstance(category, dict):
            continue
        category_id = str(category.get("id", "")).strip().lower()
        if category_id in _LEGACY_HELP_CATEGORY_IDS:
            continue
        title = str(category.get("title", "")).strip()
        description = str(category.get("description", "")).strip()
        if not title:
            continue
        output_lines.append(f"## {title}")
        if description:
            output_lines.append(f"- Descripcion: {description}")

        features = category.get("features")
        if not isinstance(features, list):
            continue

        for feature in features:
            if not isinstance(feature, dict):
                continue
            feature_title = str(feature.get("title", "")).strip()
            feature_description = str(feature.get("description", "")).strip()
            if not feature_title:
                continue
            output_lines.append(f"### {feature_title}")
            if feature_description:
                output_lines.append(f"- Resumen: {feature_description}")

            steps = feature.get("steps")
            if isinstance(steps, list) and steps:
                output_lines.append("Pasos:")
                for index, step in enumerate(steps, start=1):
                    if str(step).strip():
                        output_lines.append(f"{index}. {str(step).strip()}")

            tips = feature.get("tips")
            if isinstance(tips, list) and tips:
                output_lines.append("Consejos utiles:")
                for tip in tips:
                    if str(tip).strip():
                        output_lines.append(f"- {str(tip).strip()}")

    return "\n".join(output_lines).strip()


@lru_cache(maxsize=1)
def _load_help_knowledge() -> str:
    parts = [
        _load_synced_help_center_knowledge(),
        _load_help_knowledge_extra(),
    ]
    return "\n\n".join(part for part in parts if part).strip()


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _normalize_search_text(value: str) -> str:
    return _strip_accents(value).lower().strip()


def _tokenize_search_terms(value: str) -> set[str]:
    normalized = _normalize_search_text(value)
    return {
        token
        for token in _SEARCH_TOKEN_RE.findall(normalized)
        if len(token) >= 2 and token not in _SEARCH_STOPWORDS
    }


def _rank_knowledge_chunks(question: str) -> list[tuple[float, int, dict[str, str]]]:
    chunks = list(_knowledge_chunks())
    if not chunks:
        return []

    query_terms, matched_phrases = _expand_query_terms(question)
    scored = [
        (
            _score_knowledge_chunk(chunk, query_terms, matched_phrases, question),
            index,
            chunk,
        )
        for index, chunk in enumerate(chunks)
    ]
    scored.sort(key=lambda item: (item[0], -item[1]), reverse=True)
    return scored


@lru_cache(maxsize=1)
def _knowledge_chunks() -> tuple[dict[str, str], ...]:
    knowledge = _load_help_knowledge()
    if not knowledge:
        return tuple()

    chunks: list[dict[str, str]] = []
    current_h2: str | None = None
    current_h3: str | None = None
    current_lines: list[str] = []

    def flush_chunk() -> None:
        if not current_lines or not (current_h2 or current_h3):
            return

        heading_path = " > ".join(part for part in (current_h2, current_h3) if part)
        content = "\n".join(current_lines).strip()
        search_text = _normalize_search_text(f"{heading_path}\n{content}")
        chunks.append(
            {
                "heading": heading_path,
                "heading_normalized": _normalize_search_text(heading_path),
                "content": content,
                "search_text": search_text,
            }
        )

    for raw_line in knowledge.splitlines():
        line = raw_line.rstrip()
        if line.startswith("## "):
            flush_chunk()
            current_h2 = line[3:].strip()
            current_h3 = None
            current_lines = [f"## {current_h2}"]
            continue
        if line.startswith("### "):
            flush_chunk()
            current_h3 = line[4:].strip()
            current_lines = [f"## {current_h2}"] if current_h2 else []
            current_lines.append(f"### {current_h3}")
            continue
        if current_h2 or current_h3:
            current_lines.append(line)

    flush_chunk()
    return tuple(chunks)


def _expand_query_terms(question: str) -> tuple[set[str], set[str]]:
    normalized_question = _normalize_search_text(question)
    terms = _tokenize_search_terms(normalized_question)
    matched_phrases: set[str] = set()

    for phrase, synonyms in _QUERY_SYNONYMS.items():
        normalized_phrase = _normalize_search_text(phrase)
        phrase_tokens = _tokenize_search_terms(normalized_phrase)
        if normalized_phrase in normalized_question or (phrase_tokens and phrase_tokens.issubset(terms)):
            matched_phrases.add(normalized_phrase)
            terms.update(phrase_tokens)
            for synonym in synonyms:
                terms.update(_tokenize_search_terms(synonym))

    return terms, matched_phrases


def _score_knowledge_chunk(
    chunk: dict[str, str],
    query_terms: set[str],
    matched_phrases: set[str],
    question: str,
) -> float:
    if not query_terms and not matched_phrases and not question:
        return 0.0

    score = 0.0
    search_text = chunk["search_text"]
    heading = chunk["heading_normalized"]
    chunk_terms = _tokenize_search_terms(search_text)
    normalized_question = _normalize_search_text(question)
    raw_question_terms = set(_SEARCH_TOKEN_RE.findall(normalized_question))

    for term in query_terms:
        if term in heading:
            score += 4.0
        elif term in chunk_terms:
            score += 1.25

    for phrase in matched_phrases:
        if phrase in search_text:
            score += 5.0

    if normalized_question and normalized_question in search_text:
        score += 8.0

    if any(token in raw_question_terms for token in {"donde", "ruta", "ir", "acceder"}):
        if "#/" in chunk["content"]:
            score += 2.0

    if any(token in raw_question_terms for token in {"crear", "como", "pasos", "gestionar"}):
        if "1." in chunk["content"] or "- " in chunk["content"]:
            score += 1.0

    return score


def _select_relevant_knowledge(question: str, *, max_chunks: int = 6) -> str:
    chunks = list(_knowledge_chunks())
    if not chunks:
        return ""

    scored = _rank_knowledge_chunks(question)

    selected: list[dict[str, str]] = []
    seen_headings: set[str] = set()

    for chunk in chunks:
        if chunk["heading_normalized"] in _DEFAULT_KNOWLEDGE_SECTIONS:
            selected.append(chunk)
            seen_headings.add(chunk["heading"])

    for score, _index, chunk in scored:
        if score <= 0:
            continue
        if chunk["heading"] in seen_headings:
            continue
        selected.append(chunk)
        seen_headings.add(chunk["heading"])
        if len(selected) >= max_chunks:
            break

    if not selected:
        selected = chunks[:max_chunks]

    return "\n\n".join(chunk["content"] for chunk in selected[:max_chunks]).strip()


def _conversation_question(messages: list[HelpChatMessage]) -> str:
    user_messages = [
        message.content.strip()
        for message in messages
        if message.role == "user" and message.content.strip()
    ]
    if not user_messages:
        return ""

    last_message = user_messages[-1]
    if not _is_followup_message(last_message):
        return last_message

    for previous_message in reversed(user_messages[:-1]):
        if not previous_message:
            continue
        if _has_explicit_topic(previous_message) or len(_tokenize_search_terms(previous_message)) >= 2:
            return f"{previous_message} {last_message}".strip()

    return last_message


def _question_tokens(question: str) -> set[str]:
    return set(_SEARCH_TOKEN_RE.findall(_normalize_search_text(question)))


def _contains_phrase(question: str, *phrases: str) -> bool:
    normalized = _normalize_search_text(question)
    return any(_normalize_search_text(phrase) in normalized for phrase in phrases)


def _detected_topics(question: str) -> list[str]:
    topics: list[str] = []

    def add(topic: str, *phrases: str) -> None:
        if topic not in topics and _contains_phrase(question, *phrases):
            topics.append(topic)

    add(
        "file_sharing",
        "compartir archivos",
        "adjuntar archivo",
        "adjuntar archivos",
        "enviar archivo",
        "enviar archivos",
        "mandar archivo",
        "mandar archivos",
        "clip",
    )
    add(
        "language",
        "idioma",
        "lenguaje",
        "language",
    )
    add(
        "organization",
        "organizacion",
        "organización",
        "branding",
        "logo",
        "colores corporativos",
    )
    add(
        "calendar",
        "calendario",
        "tareas",
        "task",
        "timeline",
    )
    add(
        "notifications",
        "notificacion",
        "notificaciones",
        "campana",
    )
    add(
        "messages",
        "mensaje",
        "mensajes",
        "chat",
        "conversacion",
        "conversaciones",
    )
    add(
        "help",
        "donde esta ayuda",
        "abrir ayuda",
        "centro de ayuda",
    )
    add(
        "settings",
        "ajustes",
        "configuracion",
        "perfil",
        "actualizaciones",
    )
    add(
        "inventory",
        "inventario",
    )
    add(
        "repasos_postventa",
        "repaso",
        "repasos",
        "postventa",
        "post-venta",
        "garantia",
    )
    add(
        "economic_analysis",
        "parte economico",
        "analisis economico",
        "informe economico",
        "costes",
    )
    add(
        "work_reports",
        "parte de obra",
        "parte de trabajo",
        "partes de trabajo",
        "nuevo parte",
        "crear un parte",
        "ver un parte",
    )
    add(
        "access_control",
        "control de acceso",
        "control de accesos",
        "registro de accesos",
    )
    add(
        "user_management",
        "gestion de usuarios",
        "permisos",
        "invitar usuario",
    )
    add(
        "radar",
        "radar",
    )
    add(
        "offline",
        "offline",
        "sin conexion",
        "sin conexión",
    )
    add(
        "security",
        "seguridad",
        "rls",
        "jwt",
        "cumplimiento",
        "gdpr",
        "iso 27001",
        "soc 2",
    )
    add(
        "works",
        "obra",
        "obras",
        "proyecto",
        "proyectos",
    )
    return topics


def _has_explicit_topic(question: str) -> bool:
    return bool(_detected_topics(question))


def _is_followup_message(question: str) -> bool:
    normalized = _normalize_search_text(question)
    if not normalized:
        return False
    if _has_explicit_topic(question):
        return False

    search_terms = _tokenize_search_terms(question)
    raw_tokens = _question_tokens(question)

    if len(search_terms) <= 1:
        return True
    if any(normalized.startswith(prefix) for prefix in _FOLLOWUP_PREFIXES) and len(search_terms) <= 4:
        return True
    if raw_tokens & _FOLLOWUP_REFERENCE_TOKENS and len(search_terms) <= 4:
        return True
    return False


def _is_where_question(question: str) -> bool:
    tokens = _question_tokens(question)
    return bool({"donde", "ruta", "acceder", "entrar", "abrir", "ir"} & tokens)


def _is_how_question(question: str) -> bool:
    tokens = _question_tokens(question)
    return bool({"como", "crear", "hacer", "gestionar", "usar", "pasos"} & tokens)


def _is_what_question(question: str) -> bool:
    tokens = _question_tokens(question)
    return bool({"que", "sirve", "analiza", "funciona"} & tokens)


def _is_role_question(question: str) -> bool:
    tokens = _question_tokens(question)
    if "rol" in tokens and {"que", "quien", "con"} & tokens:
        return True
    if "permisos" in tokens and {"que", "quien", "necesito"} & tokens:
        return True

    return _contains_phrase(
        question,
        "quien puede",
        "quién puede",
        "que rol",
        "qué rol",
        "quien lo puede",
        "quién lo puede",
        "quien puede hacerlo",
        "quién puede hacerlo",
        "que permisos",
        "qué permisos",
        "permisos necesito",
        "quien tiene acceso",
        "quién tiene acceso",
    )


def _clean_list_line(line: str) -> str:
    cleaned = _LIST_PREFIX_RE.sub("", line.strip())
    cleaned = cleaned.strip().strip('"').strip()
    return cleaned


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = " ".join(item.split()).strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(item.strip())
    return result


def _extract_numbered_steps(content: str) -> list[str]:
    steps: list[str] = []
    for raw_line in content.splitlines():
        stripped = raw_line.strip()
        if re.match(r"^\d+\.\s+", stripped):
            steps.append(_clean_list_line(stripped))
    return _dedupe_preserve_order(steps)


def _extract_summary_lines(content: str) -> list[str]:
    summaries: list[str] = []
    for raw_line in content.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("- Resumen:") or stripped.startswith("- Descripcion:"):
            cleaned = _clean_list_line(stripped)
            cleaned = re.sub(r"^(Resumen|Descripcion):\s*", "", cleaned)
            if cleaned:
                summaries.append(cleaned)
    return _dedupe_preserve_order(summaries)


def _extract_hint_lines(content: str) -> list[str]:
    hints: list[str] = []
    for raw_line in content.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("## ") or stripped.startswith("### "):
            continue
        if stripped in {"Pasos:", "Consejos utiles:"}:
            continue
        cleaned = _clean_list_line(stripped)
        if not cleaned or cleaned in {"Respuesta esperada:", "Punto de entrada exacto:"}:
            continue
        if cleaned.startswith(("Resumen:", "Descripcion:")):
            continue
        if re.match(r"^\d+\.\s+", stripped):
            continue
        hints.append(cleaned)
    return _dedupe_preserve_order(hints)


def _extract_route_lines(content: str) -> list[str]:
    routes: list[str] = []
    for raw_line in content.splitlines():
        stripped = raw_line.strip()
        if "#/" in stripped or _MARKDOWN_LINK_RE.search(stripped) or _ROUTE_LITERAL_RE.search(stripped):
            cleaned = _clean_list_line(stripped)
            if cleaned:
                routes.append(cleaned)
    return _dedupe_preserve_order(routes)


def _extract_route_targets(content: str) -> set[str]:
    return {match.group(0) for match in _ROUTE_TARGET_RE.finditer(content or "")}


def _route_hint_for_question(question: str) -> str | None:
    if _contains_phrase(question, "inventario"):
        return "la obra concreta: entra primero en [Obras](#/projects) y luego abre `Inventario`"
    if _contains_phrase(question, "repaso", "repasos"):
        return "la obra concreta: entra primero en [Obras](#/projects) y luego abre `Repasos`"
    if _contains_phrase(question, "postventa", "post-venta", "garantia"):
        return "la obra concreta: entra primero en [Obras](#/projects) y luego abre `Post-Venta`"
    if _contains_phrase(question, "maquinaria de alquiler", "alquiler", "rental"):
        return "la obra concreta: entra primero en [Obras](#/projects) y luego abre `Maquinaria de alquiler`"
    if _contains_phrase(question, "parte economico", "analisis economico", "costes", "informe economico"):
        return "[Inicio](#/) > tab `Analisis economico`"
    if _contains_phrase(
        question,
        "parte de obra",
        "parte de trabajo",
        "partes de trabajo",
        "nuevo parte",
        "crear un parte",
        "ver un parte",
    ):
        return "[Inicio](#/) > tab `Partes de trabajo`"
    if _contains_phrase(question, "control de acceso", "control de accesos", "registro de accesos"):
        return "[Inicio](#/) > tab `Control de accesos`"
    if _contains_phrase(question, "gestion de usuarios", "permisos", "invitar usuario"):
        return "Ajustes > `Gestion de usuarios` desde el engranaje superior en [Inicio](#/)"
    if _contains_phrase(question, "ajustes", "configuracion", "perfil"):
        return "el engranaje superior en [Inicio](#/)"
    if _contains_phrase(question, "ayuda"):
        return "Ajustes > `Ayuda` desde el engranaje superior en [Inicio](#/)"
    if _contains_phrase(question, "obra", "obras", "proyecto", "proyectos"):
        return "[Obras](#/projects)"
    if _contains_phrase(question, "radar"):
        return "[Radar de Obras](#/radar)"
    if _contains_phrase(question, "mensaje", "mensajes", "chat", "conversacion", "conversaciones"):
        return "el icono de mensajes del header"
    if _contains_phrase(question, "notificacion", "notificaciones"):
        return "la campana del header"
    return None


def _find_chunk_by_heading(*fragments: str) -> dict[str, str] | None:
    normalized_fragments = [_normalize_search_text(fragment) for fragment in fragments if fragment.strip()]
    if not normalized_fragments:
        return None
    for chunk in _knowledge_chunks():
        heading = chunk["heading_normalized"]
        if all(fragment in heading for fragment in normalized_fragments):
            return chunk
    return None


def _topic_chunks_for_question(question: str) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []

    def add_chunk(*fragments: str) -> None:
        chunk = _find_chunk_by_heading(*fragments)
        if chunk and chunk not in selected:
            selected.append(chunk)

    if _contains_phrase(question, "parte economico", "analisis economico", "informe economico", "costes"):
        if _contains_phrase(question, "analiza", "sirve", "funciona") or _is_what_question(question):
            add_chunk("respuestas modelo por intencion", "que analiza el parte economico")
            add_chunk("explicaciones funcionales a nivel usuario", "analisis economico")
        else:
            add_chunk("respuestas modelo por intencion", "por el analisis economico")
            add_chunk("gestion economica", "analisis economico")
        return selected

    if _contains_phrase(question, "parte de obra", "parte de trabajo", "partes de trabajo", "crear un parte", "ver un parte"):
        if _contains_phrase(question, "crear", "nuevo", "hacer") or _is_how_question(question):
            add_chunk("flujos guiados frecuentes", "crear un parte de trabajo")
            add_chunk("partes de trabajo", "crear un parte de trabajo")
        elif _contains_phrase(question, "ver", "abrir", "consultar") or _is_where_question(question):
            add_chunk("respuestas modelo por intencion", "cuando preguntan por ver un parte")
            add_chunk("flujos guiados frecuentes", "ver un parte de trabajo")
        else:
            add_chunk("explicaciones funcionales a nivel usuario", "partes de trabajo")
            add_chunk("respuestas modelo por intencion", "cuando preguntan por ver un parte")
        return selected

    if _contains_phrase(question, "inventario"):
        add_chunk("respuestas modelo por intencion", "cuando preguntan por inventario")
        add_chunk("flujos guiados frecuentes", "revisar inventario de una obra")
        add_chunk("obras", "inventario de obra")
        return selected

    if _contains_phrase(question, "repaso", "repasos", "postventa", "post-venta", "garantia"):
        add_chunk("respuestas modelo por intencion", "cuando preguntan por repasos o post-venta")
        add_chunk("flujos guiados frecuentes", "entrar en repasos o post-venta")
        return selected

    if _contains_phrase(question, "gestion de usuarios", "permisos", "invitar usuario"):
        add_chunk("respuestas modelo por intencion", "cuando preguntan por gestion de usuarios")
        add_chunk("flujos guiados frecuentes", "gestionar usuarios")
        add_chunk("gestion y administracion", "gestion de usuarios")
        return selected

    if _contains_phrase(question, "control de acceso", "control de accesos", "registro de accesos"):
        add_chunk("control de accesos", "crear control de accesos")
        add_chunk("control de accesos")
        return selected

    if _contains_phrase(question, "mensaje", "mensajes", "chat", "conversacion", "conversaciones"):
        add_chunk("comunicacion", "centro de mensajes")
        return selected

    if _contains_phrase(question, "notificacion", "notificaciones"):
        add_chunk("comunicacion", "centro de notificaciones")
        return selected

    if _contains_phrase(question, "obra", "obras", "proyecto", "proyectos"):
        add_chunk("obras", "crear y gestionar obras")
        return selected

    if _contains_phrase(question, "ajustes", "configuracion", "perfil", "ayuda"):
        add_chunk("mapa de entrada rapido")
        add_chunk("como responder cuando el usuario no encuentra algo")
        return selected

    return selected


def _fallback_help_response() -> str:
    return (
        "Puedo orientarte sobre como usar la aplicacion y donde esta cada modulo.\n\n"
        "Prueba, por ejemplo:\n"
        "1. Donde veo un parte de trabajo\n"
        "2. Como creo un parte\n"
        "3. Donde esta el inventario de una obra\n"
        "4. Que analiza el analisis economico\n"
        "5. Como entrar en repasos o post-venta"
    )


def _special_help_response(question: str) -> str | None:
    if _contains_phrase(
        question,
        "compartir archivos",
        "adjuntar archivo",
        "adjuntar archivos",
        "enviar archivo",
        "enviar archivos",
        "mandar archivo",
        "mandar archivos",
        "clip",
    ):
        return (
            "Se hace desde el chat actual.\n\n"
            "1. Pulsa el icono de mensajes del header.\n"
            "2. Abre la conversación con el usuario.\n"
            "3. Usa el icono del clip para adjuntar el archivo.\n"
            "4. Envíalo desde el propio chat.\n\n"
            "Si estás en móvil y no ves el chat arriba, abre `Chat` desde `Más opciones`."
        )

    if _contains_phrase(question, "donde esta ayuda", "abrir ayuda", "centro de ayuda") or (
        _contains_phrase(question, "ayuda") and _is_where_question(question)
    ):
        return (
            "Está en el engranaje superior del header en [Inicio](#/), dentro de la pestaña `Ayuda`.\n\n"
            "1. Abre `Ajustes`.\n"
            "2. Entra en `Ayuda`.\n"
            "3. Ahí tienes guías, FAQ y el propio chat de ayuda."
        )

    if _contains_phrase(question, "ajustes", "configuracion", "perfil", "actualizaciones"):
        detail = (
            "Dentro verás `Perfil`, `Gestion de usuarios` si tu rol lo permite, "
            "`Actualizaciones` y `Ayuda`."
        )
        if _contains_phrase(question, "perfil"):
            detail = "Dentro entra en la pestaña `Perfil`."
        elif _contains_phrase(question, "actualizaciones"):
            detail = "Dentro entra en la pestaña `Actualizaciones`."
        return (
            "Está en el engranaje superior del header en [Inicio](#/).\n\n"
            f"{detail}"
        )

    if _contains_phrase(question, "idioma", "lenguaje", "language"):
        return (
            "En la UI actual se cambia desde `Más opciones` en móvil.\n\n"
            "1. Abre el menú de tres puntos del header.\n"
            "2. Pulsa el selector de idioma.\n"
            "3. Elige `Español` o `English`.\n\n"
            "No veo un selector independiente en el header de escritorio actual."
        )

    if _contains_phrase(question, "organizacion", "organización", "branding", "logo", "colores corporativos"):
        return (
            "En la UI actual no veo una pestaña independiente de `Organización` dentro de `Ajustes`.\n\n"
            "Ahora mismo las pestañas visibles son `Perfil`, `Gestion de usuarios`, `Actualizaciones` y `Ayuda`.\n"
            "Si necesitas datos legales, branding o logo, puede depender de una pantalla administrativa que no está expuesta en este flujo."
        )

    if _contains_phrase(question, "calendario", "tareas", "task", "timeline"):
        return (
            "En la ayuda funcional aparece como acceso desde `Más opciones` > `Calendario` en móvil.\n\n"
            "En la UI actual no veo una ruta principal pública para el calendario en el router, así que puede depender de que esa acción esté habilitada en tu versión."
        )

    return None


def _role_help_response(user: User, question: str) -> str | None:
    topics = set(_detected_topics(question))
    if not topics:
        return None

    current_roles = _current_role_names(user)
    current_role = current_roles[0] if current_roles else "usuario"

    admin_only_topics = {"user_management", "organization"}
    general_topics = {"help", "settings", "language", "messages", "notifications", "radar", "offline"}
    operational_topics = {
        "file_sharing",
        "calendar",
        "inventory",
        "repasos_postventa",
        "economic_analysis",
        "work_reports",
        "access_control",
        "works",
    }

    if topics & admin_only_topics:
        return (
            "Este acceso lo reservaría a `super_admin` o `tenant_admin`.\n\n"
            "No lo daría por disponible para `usuario` porque es un área administrativa."
            f"\n\nTu rol detectado ahora mismo es `{current_role}`."
        )

    if topics & general_topics:
        return (
            "Esto debería estar disponible para cualquier usuario autenticado."
            "\n\n`super_admin` y `tenant_admin` lo tienen sin problema, y en `usuario` no parece requerir un permiso administrativo especial."
            f"\n\nTu rol detectado ahora mismo es `{current_role}`."
        )

    if topics & operational_topics:
        return (
            "`super_admin` y `tenant_admin` pueden hacerlo seguro."
            "\n\nEn `usuario` depende del perfil operativo y, en algunos casos, de la obra asignada o del permiso concreto."
            "\nNo te prometo más precisión porque en la UI actual varios roles legacy se agrupan bajo `usuario`."
            f"\n\nTu rol detectado ahora mismo es `{current_role}`."
        )

    return (
        "Con seguridad lo pueden hacer `super_admin` y `tenant_admin`."
        "\n\nEn `usuario` dependerá del permiso concreto del módulo."
        f"\n\nTu rol detectado ahora mismo es `{current_role}`."
    )


def _append_contextual_note(response: str, question: str) -> str:
    normalized = _normalize_search_text(question)
    topics = _detected_topics(question)

    if "movil" in normalized:
        if "messages" in topics and "`Más opciones`" not in response:
            return (
                f"{response}\n\n"
                "En móvil, si no ves el acceso directo arriba, abre `Chat` desde `Más opciones`."
            )
        if "notifications" in topics and "móvil" not in response.lower():
            return f"{response}\n\nEn móvil la campana sigue estando en el header."
        if "settings" in topics and "móvil" not in response.lower():
            return f"{response}\n\nEn móvil el engranaje de `Ajustes` sigue en el header."
        if "help" in topics and "móvil" not in response.lower():
            return f"{response}\n\nEn móvil primero entra en `Ajustes` y desde ahí abre `Ayuda`."

    if "escritorio" in normalized or "desktop" in normalized:
        if "language" in topics and "escritorio actual" not in response:
            return f"{response}\n\nEn escritorio no veo un selector independiente de idioma en la UI actual."
        if "messages" in topics and "header" not in response.lower():
            return f"{response}\n\nEn escritorio lo tienes en el header."
        if "notifications" in topics and "header" not in response.lower():
            return f"{response}\n\nEn escritorio la campana también está en el header."
        if "settings" in topics and "header" not in response.lower():
            return f"{response}\n\nEn escritorio el acceso sigue siendo el engranaje del header."
        if "file_sharing" in topics and "escritorio" not in response.lower():
            return f"{response}\n\nEn escritorio se hace igual, desde la conversación abierta en el chat."

    return response


def _build_help_response(user: User, messages: list[HelpChatMessage]) -> str:
    question = _conversation_question(messages)
    if not question:
        return _fallback_help_response()

    role_response = _role_help_response(user, question) if _is_role_question(question) else None
    if role_response:
        return _append_contextual_note(role_response, question)

    special_response = _special_help_response(question)
    if special_response:
        return _append_contextual_note(special_response, question)

    relevant_chunks = _topic_chunks_for_question(question)
    if not relevant_chunks:
        ranked = _rank_knowledge_chunks(question)
        relevant_chunks = [chunk for score, _index, chunk in ranked if score > 0][:4]
    if not relevant_chunks:
        return _fallback_help_response()

    route_hint = _route_hint_for_question(question)
    steps: list[str] = []
    summaries: list[str] = []
    hints: list[str] = []
    routes: list[str] = []

    for chunk in relevant_chunks:
        steps.extend(_extract_numbered_steps(chunk["content"]))
        summaries.extend(_extract_summary_lines(chunk["content"]))
        hints.extend(_extract_hint_lines(chunk["content"]))
        routes.extend(_extract_route_lines(chunk["content"]))

    steps = _dedupe_preserve_order(steps)
    summaries = _dedupe_preserve_order(summaries)
    hints = _dedupe_preserve_order(hints)
    routes = _dedupe_preserve_order(routes)

    intro_line = summaries[0] if summaries else (hints[0] if hints else None)
    location_line = route_hint or (routes[0] if routes else None)
    asks_where = _is_where_question(question)
    asks_how = _is_how_question(question)
    asks_what = _is_what_question(question)

    response_lines: list[str] = []

    if asks_where:
        if location_line:
            response_lines.append(f"Está en {location_line}.")
        elif intro_line:
            response_lines.append(intro_line)
        if steps:
            response_lines.append("")
            response_lines.append("Pasos rápidos:")
            response_lines.extend(f"{index}. {step}" for index, step in enumerate(steps[:3], start=1))
        elif len(hints) > 1:
            response_lines.append("")
            response_lines.append(hints[1])
    elif asks_how:
        if location_line:
            response_lines.append(f"Empieza en {location_line}.")
        elif intro_line:
            response_lines.append(intro_line)
        if steps:
            response_lines.append("")
            response_lines.extend(f"{index}. {step}" for index, step in enumerate(steps[:5], start=1))
        else:
            extra_hints = hints[1:4] if intro_line and len(hints) > 1 else hints[:3]
            response_lines.extend(f"- {hint}" for hint in extra_hints)
    elif asks_what:
        if intro_line:
            response_lines.append(intro_line)
        elif hints:
            response_lines.append(hints[0])
        if location_line:
            response_lines.append(f"Lo abres desde {location_line}.")
        extra_hints = hints[1:4] if hints else []
        response_lines.extend(f"- {hint}" for hint in extra_hints)
    else:
        if intro_line:
            response_lines.append(intro_line)
        if location_line:
            response_lines.append(f"Punto de entrada: {location_line}.")
        if steps:
            response_lines.append("")
            response_lines.extend(f"{index}. {step}" for index, step in enumerate(steps[:3], start=1))
        else:
            response_lines.extend(f"- {hint}" for hint in hints[:3])

    cleaned_response = "\n".join(line for line in response_lines if line is not None).strip()
    if not cleaned_response:
        return _fallback_help_response()
    return _append_contextual_note(cleaned_response, question)


def _help_system_prompt(user: User, messages: list[HelpChatMessage]) -> str:
    role_labels = ", ".join(_current_role_names(user))
    last_user_message = next(
        (message.content for message in reversed(messages) if message.role == "user" and message.content.strip()),
        "",
    )
    knowledge = _select_relevant_knowledge(last_user_message) or _load_help_knowledge()
    return f"""
Eres "Ayuda IA", el asistente interno de una aplicacion de gestion de obras.
Tu unica funcion es explicar como usar la aplicacion y orientar al usuario hasta la pantalla correcta.

CONTEXTO DEL USUARIO
- Nombre: {user.full_name or "Usuario"}
- Roles detectados: {role_labels}

OBJETIVO
- Responder preguntas del tipo "como hago X", "donde esta Y", "como funciona Z".
- Dar instrucciones cortas, practicas y fiables.
- Incluir enlaces Markdown clicables cuando exista una ruta real.
- Si una funcion no tiene ruta directa y se abre como dialogo o desde un menu, dilo claramente.
- Si no estas seguro, reconoce el limite y redirige al camino mas cercano real.

REGLAS
- Responde siempre en espanol.
- No inventes pantallas, botones, rutas ni permisos.
- Los unicos roles vigentes que puedes mencionar son `super_admin`, `tenant_admin` y `usuario`.
- Si detectas nombres legacy en el historial o en texto del usuario, reinterpretalos pero no los uses como respuesta oficial.
- No hables de temas ajenos al uso de la aplicacion.
- Prioriza pasos concretos sobre explicaciones abstractas.
- Si el usuario pregunta por una accion avanzada, indica tambien el punto de entrada exacto.
- Cuando tenga sentido, usa este formato:
  1. Donde ir
  2. Que pulsar
  3. Que revisar

ESTILO DE RESPUESTA
- Usa Markdown simple.
- Los enlaces deben ir en formato `[texto](#/ruta)` cuando la ruta exista.
- Si la accion depende de elegir una obra concreta y no conoces su `workId`, indica primero que entre en [Obras](#/projects).
- Si el usuario pregunta "donde", responde primero con la ruta o punto de entrada.
- Si el usuario pregunta "como", responde con pasos.
- Interpreta estos sinonimos habituales del usuario:
  - "parte de obra" = "parte de trabajo"
  - "parte economico" = "analisis economico"
  - "postventa" = "post-venta"
  - "maq. alquiler" = "maquinaria de alquiler"

BASE DE CONOCIMIENTO AUTORIZADA
{knowledge}
""".strip()


def _help_llm_model() -> str | None:
    configured = str(settings.ollama_help_model or "").strip()
    if configured:
        return configured

    fallback = str(settings.ollama_json_model or "").strip()
    return fallback or None


def _help_llm_enabled() -> bool:
    return bool(settings.ai_help_llm_enabled and _help_llm_model())


def _help_llm_is_temporarily_down() -> bool:
    return _HELP_LLM_DOWN_UNTIL > time.monotonic()


def _mark_help_llm_temporarily_down() -> None:
    global _HELP_LLM_DOWN_UNTIL
    ttl = max(int(settings.ai_circuit_breaker_ttl_seconds), 5)
    _HELP_LLM_DOWN_UNTIL = time.monotonic() + ttl


def _clear_help_llm_temporarily_down() -> None:
    global _HELP_LLM_DOWN_UNTIL
    _HELP_LLM_DOWN_UNTIL = 0.0


def _recent_help_history(messages: list[HelpChatMessage], *, max_messages: int = 6) -> str:
    lines: list[str] = []
    for message in messages[-max_messages:]:
        content = " ".join(message.content.split()).strip()
        if not content:
            continue
        speaker = "Usuario" if message.role == "user" else "Asistente"
        lines.append(f"- {speaker}: {content}")
    return "\n".join(lines) or "- Usuario: sin historial reciente."


def _help_llm_system_prompt() -> str:
    return """
Eres "Ayuda IA", el asistente de ayuda de una aplicacion de gestion de obras.
Solo puedes responder con informacion autorizada sobre el uso real de la aplicacion.

REGLAS
- Responde siempre en espanol.
- Usa un tono natural y directo.
- No inventes pantallas, rutas, permisos ni botones.
- Conserva cualquier ruta `#/...`, nombre de modulo, nombre de pestaña y rol oficial cuando aparezcan en la respuesta base o en la base autorizada.
- Los unicos roles oficiales que puedes mencionar son `super_admin`, `tenant_admin` y `usuario`.
- Si la respuesta base ya es valida, limitate a mejorar claridad y redaccion.
- Si la respuesta base es demasiado generica, puedes concretar usando solo la base de conocimiento autorizada.
- Devuelve solo la respuesta final en Markdown simple, sin prefacios ni explicaciones sobre el modelo.
""".strip()


def _help_llm_user_prompt(
    user: User,
    messages: list[HelpChatMessage],
    *,
    question: str,
    draft: str,
    knowledge: str,
) -> str:
    role_labels = ", ".join(_current_role_names(user))
    topics = ", ".join(_detected_topics(question)) or "sin clasificar"
    draft_mode = "generica" if draft == _fallback_help_response() else "concreta"

    return f"""
PREGUNTA ACTUAL
{question}

USUARIO
- Nombre: {user.full_name or "Usuario"}
- Roles detectados: {role_labels}
- Temas detectados: {topics}

HISTORIAL RECIENTE
{_recent_help_history(messages)}

RESPUESTA BASE AUTORIZADA ({draft_mode})
{draft}

BASE DE CONOCIMIENTO AUTORIZADA
{knowledge}

TAREA
- Redacta la mejor respuesta final posible para el usuario.
- Si la respuesta base ya resuelve la pregunta, no cambies los hechos: solo hazla mas natural.
- Si la respuesta base es generica, concreta usando exclusivamente la base autorizada.
- Si la pregunta es "donde", prioriza primero el punto de entrada o la ruta.
- Si la pregunta es "como", prioriza pasos claros.
- Si la pregunta sigue un contexto anterior, manten ese contexto.
""".strip()


def _sanitize_help_llm_response(content: str) -> str:
    cleaned = (content or "").replace("\r\n", "\n").strip()
    return re.sub(r"\n{3,}", "\n\n", cleaned)


def _is_valid_help_llm_response(
    *,
    question: str,
    candidate: str,
    draft: str,
    knowledge: str,
) -> bool:
    if not candidate or len(candidate) < 24:
        return False
    if "```" in candidate:
        return False

    normalized_candidate = _normalize_search_text(candidate)
    if any(token in normalized_candidate for token in _LEGACY_ROLE_LEAKS):
        return False

    allowed_routes = _extract_route_targets(draft) | _extract_route_targets(knowledge)
    candidate_routes = _extract_route_targets(candidate)
    if not candidate_routes.issubset(allowed_routes):
        return False

    draft_routes = _extract_route_targets(draft)
    if _is_where_question(question) and draft_routes and not candidate_routes:
        return False

    if draft != _fallback_help_response() and _contains_phrase(
        candidate,
        "no tengo suficiente contexto",
        "no dispongo de contexto",
        "necesito mas contexto",
        "necesitaria mas contexto",
    ):
        return False

    return True


def _rewrite_help_response_with_ollama(
    user: User,
    messages: list[HelpChatMessage],
    *,
    question: str,
    draft: str,
) -> str:
    model = _help_llm_model()
    if not question or not model:
        return draft

    knowledge = _select_relevant_knowledge(question, max_chunks=4) or _load_help_knowledge()
    prompt = _help_llm_user_prompt(
        user,
        messages,
        question=question,
        draft=draft,
        knowledge=knowledge,
    )

    try:
        candidate = OllamaClient().generate_text(
            prompt,
            model=model,
            system=_help_llm_system_prompt(),
            timeout=float(settings.ollama_help_timeout_seconds),
            options={"temperature": 0.2},
            keep_alive="10m",
        )
    except AIClientError as exc:
        _mark_help_llm_temporarily_down()
        logger.info("Ayuda IA usa fallback local porque Ollama no responde: %s", exc)
        return draft

    cleaned_candidate = _sanitize_help_llm_response(candidate)
    if not _is_valid_help_llm_response(
        question=question,
        candidate=cleaned_candidate,
        draft=draft,
        knowledge=knowledge,
    ):
        logger.info("Ayuda IA descarta la respuesta de Ollama y conserva la base local.")
        return draft

    _clear_help_llm_temporarily_down()
    return _append_contextual_note(cleaned_candidate, question)


def _build_help_chat_response(user: User, messages: list[HelpChatMessage]) -> str:
    draft = _build_help_response(user, messages)
    if not _help_llm_enabled() or _help_llm_is_temporarily_down():
        return draft

    question = _conversation_question(messages)
    return _rewrite_help_response_with_ollama(
        user,
        messages,
        question=question,
        draft=draft,
    )


@router.post("/construction-chat")
async def construction_chat_disabled(_: dict[str, Any]) -> StreamingResponse:
    return StreamingResponse(_stream_disabled_message(), media_type="text/event-stream")


@router.post("/help-chat")
async def help_chat(
    payload: HelpChatRequest,
    current_user: User = Depends(get_current_active_user),
) -> StreamingResponse:
    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="messages es obligatorio.",
        )

    content = _build_help_chat_response(current_user, payload.messages)
    return StreamingResponse(_stream_text_message(content), media_type="text/event-stream")
