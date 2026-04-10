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
_ANDROID_FAQ_PATH = Path(__file__).with_name("ai_help_android_faq.md")
_HELP_CATALOG_SNAPSHOT_PATH = Path(__file__).with_name("ai_help_catalog_snapshot.json")
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
    "rutas directas confirmadas",
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
_QUESTION_STARTERS = (
    "como puedo ",
    "como hago ",
    "como entro ",
    "como abro ",
    "como ",
    "donde puedo ver ",
    "donde puedo ",
    "donde consulto ",
    "donde esta ",
    "donde estan ",
    "donde veo ",
    "donde ",
    "que es ",
    "que hace ",
    "que significa ",
)
_ALIAS_PREFIXES = (
    "como puedo ",
    "como ",
    "donde esta ",
    "donde veo ",
    "que es ",
)
_LEGACY_ROLE_LEAKS = {
    "office-role",
    "reader-role",
    "foreman",
    "site_manager",
    "reader",
}
_MIN_RANKED_HELP_CHUNK_SCORE = 7.0


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
def _load_android_faq_knowledge() -> str:
    try:
        return _ANDROID_FAQ_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


@lru_cache(maxsize=1)
def _load_help_center_catalog() -> tuple[dict[str, Any], ...]:
    raw_catalog: Any = None
    for path in (_HELP_CATALOG_PATH, _HELP_CATALOG_SNAPSHOT_PATH):
        try:
            raw_catalog = json.loads(path.read_text(encoding="utf-8"))
            break
        except (OSError, json.JSONDecodeError):
            continue

    if not isinstance(raw_catalog, list):
        return tuple()

    catalog: list[dict[str, Any]] = []
    for category in raw_catalog:
        if isinstance(category, dict):
            catalog.append(category)
    return tuple(catalog)


@lru_cache(maxsize=1)
def _load_synced_help_center_knowledge() -> str:
    raw_catalog = _load_help_center_catalog()
    if not raw_catalog:
        return ""

    output_lines = [
        "## Catalogo sincronizado desde HelpCenter",
        "- Este bloque se genera leyendo el catalogo funcional compartido del HelpCenter del frontend.",
        "- Si cambia una guia funcional del HelpCenter, este catalogo cambia automaticamente para Ayuda IA.",
    ]

    for category in raw_catalog:
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
def _knowledge_documents() -> tuple[tuple[str, str], ...]:
    documents: list[tuple[str, str]] = []
    faq = _load_android_faq_knowledge()
    synced = _load_synced_help_center_knowledge()
    extra = _load_help_knowledge_extra()

    if faq:
        documents.append(("android_faq", faq))
    if synced:
        documents.append(("help_center", synced))
    if extra:
        documents.append(("deep_knowledge", extra))

    return tuple(documents)


@lru_cache(maxsize=1)
def _load_help_knowledge() -> str:
    return "\n\n".join(content for _source, content in _knowledge_documents()).strip()


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _normalize_search_text(value: str) -> str:
    normalized = _strip_accents(value).lower()
    return re.sub(r"\s+", " ", normalized).strip()


def _tokenize_search_terms(value: str) -> set[str]:
    normalized = _normalize_search_text(value)
    return {
        token
        for token in _SEARCH_TOKEN_RE.findall(normalized)
        if len(token) >= 2 and token not in _SEARCH_STOPWORDS
    }


def _search_tokens_list(value: str) -> list[str]:
    normalized = _normalize_search_text(value)
    return [token for token in _SEARCH_TOKEN_RE.findall(normalized) if len(token) >= 2]


def _normalize_match_token(token: str) -> str:
    normalized = _normalize_search_text(token)
    if len(normalized) > 4 and normalized.endswith("es"):
        return normalized[:-2]
    if len(normalized) > 3 and normalized.endswith("s"):
        return normalized[:-1]
    return normalized


def _is_adjacent_swap(a: str, b: str) -> bool:
    if len(a) != len(b) or len(a) < 2:
        return False
    mismatches = [index for index, (left, right) in enumerate(zip(a, b)) if left != right]
    if len(mismatches) != 2:
        return False
    first, second = mismatches
    return second == first + 1 and a[first] == b[second] and a[second] == b[first]


def _bounded_edit_distance(left: str, right: str, *, max_distance: int) -> int:
    if left == right:
        return 0
    if abs(len(left) - len(right)) > max_distance:
        return max_distance + 1

    previous = list(range(len(right) + 1))
    for row_index, left_char in enumerate(left, start=1):
        current = [row_index]
        row_min = current[0]
        for col_index, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            current_value = min(
                previous[col_index] + 1,
                current[col_index - 1] + 1,
                previous[col_index - 1] + cost,
            )
            current.append(current_value)
            if current_value < row_min:
                row_min = current_value
        if row_min > max_distance:
            return max_distance + 1
        previous = current

    return previous[-1]


def _approx_token_match(question_token: str, expected_token: str) -> bool:
    normalized_question = _normalize_match_token(question_token)
    normalized_expected = _normalize_match_token(expected_token)

    if not normalized_question or not normalized_expected:
        return False
    if normalized_question == normalized_expected:
        return True

    if len(normalized_question) < 4 or len(normalized_expected) < 4:
        return False
    if normalized_question[0] != normalized_expected[0]:
        return False
    if _is_adjacent_swap(normalized_question, normalized_expected):
        return True

    max_len = max(len(normalized_question), len(normalized_expected))
    max_distance = 1 if max_len <= 5 else 2
    return (
        _bounded_edit_distance(
            normalized_question,
            normalized_expected,
            max_distance=max_distance,
        )
        <= max_distance
    )


def _phrase_matches_question(question: str, phrase: str) -> bool:
    normalized_question = _normalize_search_text(question)
    normalized_phrase = _normalize_search_text(phrase)

    if not normalized_phrase:
        return False
    if normalized_phrase in normalized_question:
        return True

    question_tokens = _search_tokens_list(normalized_question)
    phrase_tokens = [
        token for token in _search_tokens_list(normalized_phrase) if token not in _SEARCH_STOPWORDS
    ]
    if not question_tokens or not phrase_tokens:
        return False

    for phrase_token in phrase_tokens:
        if not any(_approx_token_match(question_token, phrase_token) for question_token in question_tokens):
            return False
    return True


def _question_has_any_token(question: str, *expected_tokens: str) -> bool:
    question_tokens = _search_tokens_list(question)
    expected = [token for token in expected_tokens if token]
    if not question_tokens or not expected:
        return False
    return any(
        any(_approx_token_match(question_token, expected_token) for question_token in question_tokens)
        for expected_token in expected
    )


def _split_variants(raw_value: str) -> list[str]:
    normalized = str(raw_value or "").strip()
    if not normalized:
        return []
    return [
        variant.strip()
        for variant in re.split(r"\s+\|\s+|\s*[|]\s*", normalized)
        if variant.strip()
    ]


def _intent_id(source: str, module: str, question: str) -> str:
    normalized_source = _normalize_search_text(source).replace(" ", "-")
    normalized_module = _normalize_search_text(module).replace(" ", "-")
    normalized_question = _normalize_search_text(question).replace(" ", "-")
    return "::".join(
        part
        for part in (normalized_source, normalized_module, normalized_question)
        if part
    )


def _strip_question_starter(value: str) -> str:
    normalized = str(value or "").strip()
    lowered = _normalize_search_text(normalized)
    for starter in _QUESTION_STARTERS:
        if lowered.startswith(starter):
            stripped = normalized[len(starter):].strip(" ?!.")
            return stripped or normalized.strip(" ?!.")
    return normalized.strip(" ?!.")


def _sanitize_alias_text(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    normalized = normalized.replace("`", "").replace('"', "").replace("'", "")
    normalized = re.sub(r"\s+", " ", normalized).strip(" .,:;!?")
    return normalized


def _derive_intent_aliases(
    *,
    module: str,
    question: str,
    variants: list[str],
    response: str,
    location: str,
    steps: list[str],
) -> list[str]:
    aliases: list[str] = []
    seen: set[str] = set()

    def add_alias(raw_value: str) -> None:
        candidate = _sanitize_alias_text(raw_value)
        normalized_candidate = _normalize_search_text(candidate)
        if not candidate or len(normalized_candidate) < 4 or normalized_candidate in seen:
            return
        seen.add(normalized_candidate)
        aliases.append(candidate)

    seed_phrases = [question, *variants, response, location, *steps[:2]]
    for seed in seed_phrases:
        add_alias(seed)
        core = _strip_question_starter(seed)
        add_alias(core)
        if module and core and _normalize_search_text(core) != _normalize_search_text(module):
            add_alias(f"{module} {core}")
        if core and not any(_normalize_search_text(core).startswith(prefix.strip()) for prefix in _ALIAS_PREFIXES):
            for prefix in _ALIAS_PREFIXES:
                add_alias(f"{prefix}{core}")

    search_text = _normalize_search_text(" ".join(seed_phrases + [module]))
    for phrase, synonyms in _QUERY_SYNONYMS.items():
        normalized_phrase = _normalize_search_text(phrase)
        if normalized_phrase in search_text:
            add_alias(phrase)
            for synonym in synonyms:
                add_alias(synonym)
            continue
        for synonym in synonyms:
            if _normalize_search_text(synonym) in search_text:
                add_alias(phrase)
                add_alias(synonym)

    return aliases


def _intent_probe_queries(entry: dict[str, Any], *, max_queries: int = 6) -> list[str]:
    probes: list[str] = []
    seen: set[str] = set()

    def add_probe(raw_value: str) -> None:
        candidate = _sanitize_alias_text(raw_value)
        normalized_candidate = _normalize_search_text(candidate)
        if not candidate or normalized_candidate in seen:
            return
        seen.add(normalized_candidate)
        probes.append(candidate)

    question = str(entry.get("question", "")).strip()
    variants = [
        str(variant).strip()
        for variant in entry.get("variants", [])
        if str(variant).strip() and len(_search_tokens_list(str(variant))) >= 3
    ]
    module = str(entry.get("module", "")).strip()
    seeds = [question, *variants[:3]]
    if module and question:
        seeds.append(f"{module} {question}")

    for seed in seeds:
        add_probe(seed)
        core = _strip_question_starter(seed)
        if len(_search_tokens_list(core)) >= 3:
            add_probe(core)
        if core and len(_search_tokens_list(core)) >= 3 and not _normalize_search_text(core).startswith(("como ", "donde ", "que ")):
            add_probe(f"como puedo {core}")
            add_probe(f"donde esta {core}")
        if len(probes) >= max_queries:
            break

    return probes[:max_queries]


def _parse_android_faq_intents() -> tuple[dict[str, Any], ...]:
    faq = _load_android_faq_knowledge()
    if not faq:
        return tuple()

    intents: list[dict[str, Any]] = []
    current_module = ""
    current_question = ""
    payload: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal payload
        if not payload or not payload.get("question"):
            payload = None
            return
        question = str(payload.get("question", "")).strip()
        variants = [variant for variant in payload.get("variants", []) if str(variant).strip()]
        response = str(payload.get("response", "")).strip()
        location = str(payload.get("location", "")).strip()
        notes = str(payload.get("notes", "")).strip()
        aliases = _derive_intent_aliases(
            module=current_module,
            question=question,
            variants=variants,
            response=response,
            location=location,
            steps=[],
        )
        search_parts = [current_module, question, *variants, *aliases, response, location, notes]
        intents.append(
            {
                "intent_id": _intent_id("android_faq_intent", current_module, question),
                "source": "android_faq_intent",
                "module": current_module,
                "question": question,
                "variants": variants,
                "aliases": aliases,
                "response": response,
                "location": location,
                "notes": notes,
                "steps": [],
                "search_text": _normalize_search_text(" ".join(part for part in search_parts if part)),
            }
        )
        payload = None

    for raw_line in faq.splitlines():
        line = raw_line.strip()
        if line.startswith("## Modulo:"):
            flush()
            current_module = line.split(":", 1)[1].strip()
            current_question = ""
            continue
        if line.startswith("### "):
            flush()
            current_question = line[4:].strip()
            payload = {
                "question": current_question,
                "variants": [],
                "response": "",
                "location": "",
                "notes": "",
            }
            continue
        if not payload or not line.startswith("- "):
            continue

        content = line[2:].strip()
        if ":" not in content:
            continue
        key, value = content.split(":", 1)
        normalized_key = _normalize_search_text(key)
        normalized_value = value.strip()

        if normalized_key == "variantes":
            payload["variants"] = _split_variants(normalized_value)
        elif normalized_key == "respuesta canonica":
            payload["response"] = normalized_value
        elif normalized_key == "ubicacion":
            payload["location"] = normalized_value
        elif normalized_key in {"restricciones / notas", "restricciones", "notas"}:
            payload["notes"] = normalized_value

    flush()
    return tuple(intents)


def _parse_help_center_intents() -> tuple[dict[str, Any], ...]:
    catalog = _load_help_center_catalog()
    if not catalog:
        return tuple()

    intents: list[dict[str, Any]] = []
    for category in catalog:
        category_id = str(category.get("id", "")).strip().lower()
        if category_id in _LEGACY_HELP_CATEGORY_IDS:
            continue

        module = str(category.get("title", "")).strip()
        description = str(category.get("description", "")).strip()
        features = category.get("features")
        if not module or not isinstance(features, list):
            continue

        for feature in features:
            if not isinstance(feature, dict):
                continue
            question = str(feature.get("title", "")).strip()
            response = str(feature.get("description", "")).strip()
            steps = [
                str(step).strip()
                for step in feature.get("steps", [])
                if str(step).strip()
            ] if isinstance(feature.get("steps"), list) else []
            tips = [
                str(tip).strip()
                for tip in feature.get("tips", [])
                if str(tip).strip()
            ] if isinstance(feature.get("tips"), list) else []
            if not question:
                continue

            location = steps[0] if steps else ""
            aliases = _derive_intent_aliases(
                module=module,
                question=question,
                variants=[],
                response=response,
                location=location,
                steps=steps,
            )
            search_parts = [module, description, question, *aliases, response, location, *steps, *tips]
            intents.append(
                {
                    "intent_id": _intent_id("help_center_intent", module, question),
                    "source": "help_center_intent",
                    "module": module,
                    "question": question,
                    "variants": [],
                    "aliases": aliases,
                    "response": response,
                    "location": location,
                    "notes": " ".join(tips[:2]).strip(),
                    "steps": steps,
                    "search_text": _normalize_search_text(" ".join(part for part in search_parts if part)),
                }
            )

    return tuple(intents)


@lru_cache(maxsize=1)
def _intent_catalog() -> tuple[dict[str, Any], ...]:
    return _parse_android_faq_intents() + _parse_help_center_intents()


def _score_intent_entry(question: str, entry: dict[str, Any]) -> float:
    normalized_question = _normalize_search_text(question)
    normalized_question_core = _normalize_search_text(_strip_question_starter(question))
    question_terms, _matched_phrases = _expand_query_terms(question)
    entry_terms = _tokenize_search_terms(str(entry.get("search_text", "")))
    entry_question = str(entry.get("question", ""))
    entry_module = str(entry.get("module", ""))
    normalized_entry_question = _normalize_search_text(entry_question)
    normalized_entry_module = _normalize_search_text(entry_module)
    title_terms = _tokenize_search_terms(entry_question)
    module_terms = _tokenize_search_terms(entry_module)
    alias_terms = _tokenize_search_terms(" ".join(str(alias) for alias in entry.get("aliases", [])))
    score = 0.0

    if _phrase_matches_question(question, entry_question):
        score += 8.0

    for variant in entry.get("variants", []):
        if _phrase_matches_question(question, str(variant)):
            score += 10.0
    for alias in entry.get("aliases", []):
        if _phrase_matches_question(question, str(alias)):
            score += 6.0

    for term in question_terms:
        if term in title_terms:
            score += 1.75
        elif term in alias_terms:
            score += 1.5
        elif term in entry_terms:
            score += 1.25

    module = entry_module
    if module and _phrase_matches_question(question, module):
        score += 3.0

    source = str(entry.get("source", ""))
    if source == "android_faq_intent":
        score += 2.0
    elif source == "help_center_intent":
        score += 0.75

    if normalized_question and normalized_question in str(entry.get("search_text", "")):
        score += 4.0

    if normalized_question and normalized_question == normalized_entry_question:
        score += 40.0
    elif normalized_entry_question and normalized_question.startswith(normalized_entry_question):
        score += 14.0
    if normalized_question_core and normalized_question_core == normalized_entry_question:
        score += 32.0

    combined_title = _normalize_search_text(f"{entry_module} {entry_question}")
    if normalized_question and combined_title:
        if normalized_question == combined_title:
            score += 44.0
        elif normalized_question.startswith(combined_title):
            score += 18.0
    if normalized_question_core and combined_title:
        if normalized_question_core == combined_title:
            score += 36.0
        elif normalized_question_core.startswith(combined_title):
            score += 16.0

    if source == "help_center_intent":
        if normalized_entry_question and normalized_entry_question in normalized_question:
            score += 8.0
        if normalized_entry_module and normalized_entry_module in normalized_question:
            score += 5.0
        if normalized_question_core and normalized_question_core == normalized_entry_question:
            score += 32.0
        if normalized_entry_question and normalized_entry_question in normalized_question_core:
            score += 10.0
        if normalized_entry_module and normalized_entry_module in normalized_question_core:
            score += 6.0
        if normalized_entry_module and normalized_entry_question:
            if normalized_entry_module in normalized_question and normalized_entry_question in normalized_question:
                score += 18.0
            if (
                normalized_entry_module in normalized_question_core
                and normalized_entry_question in normalized_question_core
            ):
                score += 18.0

    strong_overlap = {
        term
        for term in question_terms
        if len(term) >= 6 and (term in title_terms or term in module_terms or term in alias_terms)
    }
    if len(strong_overlap) >= 2:
        score += 8.0
    elif len(strong_overlap) == 1:
        score += 3.0

    return score


def _best_matching_intent(question: str) -> dict[str, Any] | None:
    best_entry: dict[str, Any] | None = None
    best_score = 0.0

    for entry in _intent_catalog():
        score = _score_intent_entry(question, entry)
        if score > best_score:
            best_score = score
            best_entry = entry

    if not best_entry:
        return None

    min_score = 7.5 if str(best_entry.get("source")) == "android_faq_intent" else 8.5
    if best_score < min_score:
        return None
    return best_entry


def _build_response_from_intent(question: str, entry: dict[str, Any]) -> str:
    response = str(entry.get("response", "")).strip()
    location = str(entry.get("location", "")).strip()
    notes = str(entry.get("notes", "")).strip()
    steps = [str(step).strip() for step in entry.get("steps", []) if str(step).strip()]
    asks_where = _is_where_question(question)
    asks_how = _is_how_question(question)
    asks_what = _is_what_question(question)

    def prioritized_steps(max_steps: int) -> list[str]:
        if not steps:
            return []
        if not _contains_phrase(question, "descargar", "exportar", "excel", "pdf"):
            return steps[:max_steps]

        prioritized: list[str] = []
        for step in steps:
            if step == location:
                prioritized.append(step)
                break

        for step in steps:
            if step in prioritized:
                continue
            if _contains_phrase(step, "descargar", "exportar", "excel", "pdf"):
                prioritized.append(step)

        for step in steps:
            if step in prioritized:
                continue
            prioritized.append(step)

        return prioritized[:max_steps]

    response_lines: list[str] = []

    if asks_where:
        if location:
            response_lines.append(f"Esta en {location}.")
        elif response:
            response_lines.append(response)
        if response and response not in response_lines:
            response_lines.append("")
            response_lines.append(response)
    elif asks_how:
        if location:
            if _contains_phrase(location, "ve a", "entra en", "abre"):
                response_lines.append(location)
            else:
                response_lines.append(f"Empieza en {location}.")
        elif response:
            response_lines.append(response)
        selected_steps = prioritized_steps(4)
        if selected_steps:
            response_lines.append("")
            response_lines.extend(f"{index}. {step}" for index, step in enumerate(selected_steps, start=1))
        elif response and response not in response_lines:
            response_lines.append("")
            response_lines.append(response)
    elif asks_what:
        if response:
            response_lines.append(response)
        if location:
            response_lines.append(f"Lo abres desde {location}.")
    else:
        if response:
            response_lines.append(response)
        if location:
            response_lines.append(f"Ubicacion: {location}.")
        selected_steps = prioritized_steps(3)
        if selected_steps:
            response_lines.append("")
            response_lines.extend(f"{index}. {step}" for index, step in enumerate(selected_steps, start=1))

    if notes:
        response_lines.append("")
        response_lines.append(f"Nota: {notes}")

    return "\n".join(line for line in response_lines if line is not None).strip()


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
    documents = _knowledge_documents()
    if not documents:
        return tuple()

    chunks: list[dict[str, str]] = []
    for source, knowledge in documents:
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
                    "source": source,
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
        if _phrase_matches_question(question, phrase) or (phrase_tokens and phrase_tokens.issubset(terms)):
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

    if chunk.get("source") == "android_faq":
        score += 2.5
    elif chunk.get("source") == "help_center":
        score += 0.75

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
    return any(_phrase_matches_question(question, phrase) for phrase in phrases)


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
    return _question_has_any_token(question, "donde", "ruta", "acceder", "entrar", "abrir", "ir")


def _is_how_question(question: str) -> bool:
    return _question_has_any_token(question, "como", "crear", "hacer", "gestionar", "usar", "pasos")


def _is_what_question(question: str) -> bool:
    return _question_has_any_token(question, "que", "sirve", "analiza", "funciona")


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
        return "la cabecera principal: abre `Ajustes` y, si tu perfil lo permite, entra en `Gestion de usuarios`"
    if _contains_phrase(question, "ajustes", "configuracion", "perfil"):
        return "la cabecera principal"
    if _contains_phrase(question, "ayuda"):
        return "la mensajeria de la app, donde `Ayuda IA` aparece como conversacion especial"
    if _contains_phrase(question, "obra", "obras", "proyecto", "proyectos"):
        return "[Obras](#/projects)"
    if _contains_phrase(question, "radar"):
        return "[Radar de Obras](#/radar)"
    if _contains_phrase(question, "mensaje", "mensajes", "chat", "conversacion", "conversaciones"):
        return "la burbuja flotante de mensajeria"
    if _contains_phrase(question, "notificacion", "notificaciones"):
        return "el icono de campana en la cabecera superior"
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
        add_chunk("modulo: dashboard", "que secciones principales tiene la app")
        if _contains_phrase(question, "analiza", "sirve", "funciona") or _is_what_question(question):
            add_chunk("modulo: dashboard", "que secciones principales tiene la app")
            add_chunk("respuestas modelo por intencion", "que analiza el parte economico")
            add_chunk("explicaciones funcionales a nivel usuario", "analisis economico")
        else:
            add_chunk("modulo: dashboard", "que secciones principales tiene la app")
            add_chunk("respuestas modelo por intencion", "por el analisis economico")
            add_chunk("gestion economica", "analisis economico")
        return selected

    if _contains_phrase(question, "parte de obra", "parte de trabajo", "partes de trabajo", "crear un parte", "ver un parte"):
        if _is_work_report_history_question(question):
            add_chunk("modulo: partes", "donde consulto el historial de partes")
            add_chunk("respuestas modelo por intencion", "cuando preguntan por ver un parte")
            add_chunk("flujos guiados frecuentes", "ver un parte de trabajo")
        elif _is_work_report_create_question(question):
            add_chunk("modulo: partes", "como creo un parte nuevo")
            add_chunk("flujos guiados frecuentes", "crear un parte de trabajo")
            add_chunk("partes de trabajo", "crear un parte de trabajo")
        else:
            add_chunk("modulo: partes", "como creo un parte nuevo")
            add_chunk("explicaciones funcionales a nivel usuario", "partes de trabajo")
            add_chunk("respuestas modelo por intencion", "cuando preguntan por ver un parte")
        return selected

    if _contains_phrase(question, "inventario"):
        add_chunk("modulo: inventario", "que pestanas hay dentro del inventario de una obra")
        add_chunk("modulo: inventario", "donde reviso los albaranes procesados por ia")
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
        add_chunk("modulo: accesos", "como creo un registro de control de accesos")
        add_chunk("control de accesos", "crear control de accesos")
        add_chunk("control de accesos")
        return selected

    if _contains_phrase(question, "mensaje", "mensajes", "chat", "conversacion", "conversaciones"):
        add_chunk("modulo: mensajeria", "como abro la mensajeria")
        add_chunk("modulo: mensajeria", "que pestanas tiene la mensajeria")
        add_chunk("comunicacion", "centro de mensajes")
        return selected

    if _contains_phrase(question, "notificacion", "notificaciones"):
        add_chunk("modulo: notificaciones", "como marco todas las notificaciones como leidas")
        add_chunk("modulo: dashboard", "donde veo las notificaciones")
        add_chunk("comunicacion", "centro de notificaciones")
        return selected

    if _contains_phrase(question, "obra", "obras", "proyecto", "proyectos"):
        add_chunk("modulo: obras", "como entro en la gestion detallada de una obra")
        add_chunk("obras", "crear y gestionar obras")
        return selected

    if _contains_phrase(question, "ajustes", "configuracion", "perfil", "ayuda"):
        add_chunk("modulo: dashboard", "que secciones principales tiene la app")
        add_chunk("modulo: mensajeria", "donde entra la ayuda ia dentro de la mensajeria")
        add_chunk("mapa de entrada rapido")
        add_chunk("como responder cuando el usuario no encuentra algo")
        return selected

    return selected


def _fallback_help_response() -> str:
    return (
        "No puedo responder eso con suficiente precision solo con la FAQ Android que tengo cargada.\n\n"
        f"{_help_center_redirect_note()}\n\n"
        "Prueba, por ejemplo:\n"
        "1. Donde veo un parte de trabajo\n"
        "2. Como creo un parte\n"
        "3. Donde esta el inventario de una obra\n"
        "4. Que analiza el analisis economico\n"
        "5. Como entrar en repasos o post-venta"
    )


def _help_center_redirect_note() -> str:
    return (
        "Si necesitas una referencia exacta, abre el [centro de ayuda](#/settings/help?tab=faq) y revisa `FAQ` o `Guia` dentro de la app."
    )


def _needs_help_center_redirect(response: str) -> bool:
    normalized = _normalize_search_text(response)
    uncertainty_markers = (
        "no veo ",
        "no tengo ",
        "no puedo confirmar",
        "prefiero no invent",
        "prefiero dejarlo en duda",
        "no esta documentado",
        "no hay suficiente contexto",
        "no puedo responder eso con suficiente precision",
    )
    if "ajustes" in normalized and "ayuda" in normalized and ("faq" in normalized or "guia" in normalized):
        return False
    return any(marker in normalized for marker in uncertainty_markers)


def _with_help_center_redirect(response: str) -> str:
    cleaned = (response or "").strip()
    if not cleaned or not _needs_help_center_redirect(cleaned):
        return cleaned
    return f"{cleaned}\n\n{_help_center_redirect_note()}"


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


def _is_work_report_history_question(question: str) -> bool:
    return _contains_phrase(
        question,
        "historial de partes",
        "historico de partes",
        "buscar un parte",
        "buscar parte",
        "parte antiguo",
        "partes anteriores",
        "ver partes guardados",
        "parte guardado",
        "partes guardados",
        "filtrar partes",
        "consultar un parte",
        "ver un parte",
        "abrir un parte",
    )


def _is_work_report_create_question(question: str) -> bool:
    return _contains_phrase(
        question,
        "como crear un parte",
        "crear un parte",
        "nuevo parte",
        "generar parte",
        "como hago un parte",
        "hacer un parte",
    )


def _faq_special_help_response(question: str) -> str | None:
    if _is_work_report_history_question(question):
        return (
            "Si quieres buscar un parte ya guardado, entra en [Inicio](#/) > `Partes de trabajo` y abre `Historial de partes`.\n\n"
            "1. Entra en [Inicio](#/).\n"
            "2. Abre `Partes de trabajo`.\n"
            "3. Entra en `Historial de partes`.\n"
            "4. Usa la busqueda y los filtros para localizar el parte.\n\n"
            "El listado principal muestra partes recientes, pero para buscar partes guardados la vista correcta es `Historial de partes`."
        )

    if _is_work_report_create_question(question):
        return (
            "Empieza en [Inicio](#/) > `Partes de trabajo`.\n\n"
            "1. Entra en [Inicio](#/).\n"
            "2. Abre `Partes de trabajo`.\n"
            "3. Usa `Generar parte`.\n"
            "4. Completa los datos requeridos del día.\n"
            "5. Revisa la información antes de guardar."
        )

    if _contains_phrase(question, "donde esta el inventario", "donde esta inventario", "inventario de una obra"):
        return (
            "El inventario está dentro de la obra concreta.\n\n"
            "1. Entra en [Obras](#/projects).\n"
            "2. Abre la obra que corresponda.\n"
            "3. Entra en `Inventario`.\n"
            "4. Dentro verás `Dashboard`, `Albaranes`, `Materiales` y `Herramientas`."
        )

    if _contains_phrase(question, "donde estan los mensajes", "como abro la mensajeria", "abrir chat", "mensajeria de la app"):
        return (
            "La mensajería se abre desde una burbuja flotante anclable en pantalla.\n\n"
            "1. Pulsa la burbuja flotante de mensajería.\n"
            "2. Se abrirá el panel completo de conversaciones.\n"
            "3. Dentro verás las pestañas `Chats`, `Obras` y `Contactos`."
        )

    if _contains_phrase(
        question,
        "donde estan las notificaciones",
        "donde veo las notificaciones",
        "abrir notificaciones",
        "notificaciones",
        "campana",
    ):
        return (
            "Las notificaciones se abren desde el icono de campana en la cabecera superior.\n\n"
            "1. Pulsa la campana.\n"
            "2. Revisa los avisos de la bandeja.\n"
            "3. Si lo necesitas, usa `Marcar todas` para dejarlas como leídas."
        )

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
            "No veo un flujo confirmado para compartir archivos en la FAQ Android actual.\n\n"
            "Lo que si esta documentado es que la mensajeria se abre desde una burbuja flotante y que `Ayuda IA` vive dentro de ese sistema.\n"
            "Si me dices la pantalla exacta en la que estas, intento orientarte sin inventar botones."
        )

    if _contains_phrase(question, "donde esta ayuda", "abrir ayuda", "centro de ayuda") or (
        _contains_phrase(question, "ayuda") and _is_where_question(question)
    ):
        return (
            "La Ayuda IA aparece integrada como una conversacion especial dentro de la mensajeria.\n\n"
            "1. Abre la burbuja flotante de mensajeria.\n"
            "2. Entra en la conversacion de `Ayuda IA`.\n"
            "3. Desde ahi puedes hacer la consulta."
        )

    if _contains_phrase(question, "ajustes", "configuracion", "perfil", "actualizaciones"):
        return (
            "La FAQ Android confirma que `Ajustes` esta en la cabecera principal.\n\n"
            "No tengo una descripcion mas detallada de sus subpantallas en la FAQ actual, asi que prefiero no inventarlas."
        )

    if _contains_phrase(question, "idioma", "lenguaje", "language"):
        return (
            "No veo un cambio de idioma documentado en la FAQ Android actual.\n\n"
            "No te quiero inventar una pantalla o un boton que no aparezcan en esa base de conocimiento."
        )

    if _contains_phrase(question, "organizacion", "organizaciÃ³n", "branding", "logo", "colores corporativos"):
        return (
            "No veo una pantalla de organizacion o branding confirmada en la FAQ Android actual.\n\n"
            "Lo unico que si esta claro es que `Ajustes` existe en la cabecera principal, pero la FAQ no detalla ese flujo."
        )

    if _contains_phrase(question, "calendario", "tareas", "task", "timeline"):
        return (
            "No veo un flujo de calendario documentado en la FAQ Android actual.\n\n"
            "Prefiero dejarlo en duda antes que inventarte una ruta o una opcion que no pueda confirmar."
        )

    return None


def _android_contextual_note(response: str, question: str) -> str:
    normalized = _normalize_search_text(question)
    topics = _detected_topics(question)

    if "movil" in normalized:
        if "messages" in topics and "android" not in response.lower():
            return f"{response}\n\nLa FAQ que estoy usando ya esta centrada en Android."
        if "notifications" in topics and "cabecera superior" not in response.lower():
            return f"{response}\n\nEn Android, la referencia confirmada es la cabecera superior."

    if "escritorio" in normalized or "desktop" in normalized:
        return (
            f"{response}\n\n"
            "La base que estoy usando esta centrada en Android, asi que no puedo confirmarte el flujo de escritorio con la misma fiabilidad."
        )

    return response


def _build_help_response(user: User, messages: list[HelpChatMessage]) -> str:
    question = _conversation_question(messages)
    if not question:
        return _fallback_help_response()

    role_response = _role_help_response(user, question) if _is_role_question(question) else None
    if role_response:
        return _with_help_center_redirect(_android_contextual_note(role_response, question))

    special_response = _faq_special_help_response(question) or _special_help_response(question)
    if special_response:
        return _with_help_center_redirect(_android_contextual_note(special_response, question))

    matched_intent = _best_matching_intent(question)
    if matched_intent:
        return _with_help_center_redirect(
            _android_contextual_note(_build_response_from_intent(question, matched_intent), question)
        )

    relevant_chunks = _topic_chunks_for_question(question)
    if not relevant_chunks:
        ranked = _rank_knowledge_chunks(question)
        relevant_chunks = [chunk for score, _index, chunk in ranked if score >= _MIN_RANKED_HELP_CHUNK_SCORE][:4]
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
    return _with_help_center_redirect(_android_contextual_note(cleaned_response, question))


def _help_system_prompt(user: User, messages: list[HelpChatMessage]) -> str:
    role_labels = ", ".join(_current_role_names(user))
    last_user_message = next(
        (message.content for message in reversed(messages) if message.role == "user" and message.content.strip()),
        "",
    )
    knowledge = _select_relevant_knowledge(last_user_message) or _load_help_knowledge()
    return f"""
Eres "Ayuda IA", el asistente interno de una aplicacion de gestion de obras.
Tu unica funcion es ayudar sobre la app Android real actualmente en uso, sin inventar comportamientos.

CONTEXTO DEL USUARIO
- Nombre: {user.full_name or "Usuario"}
- Roles detectados: {role_labels}

OBJETIVO
- Resolver dudas funcionales, de navegacion, de uso, de errores y de interpretacion de documentos.
- Priorizar siempre la informacion explicita y confirmada.
- Separar el contenido documental del comportamiento de la app cuando se mezclen.

CLASIFICACION MENTAL DE LA CONSULTA
- `FUNCIONAMIENTO DE LA APP`: donde esta una opcion, como crear un parte, como entrar en una obra, que hacer si no sincroniza.
- `LECTURA DE DOCUMENTO O IMAGEN`: que pone en un albaran, extraer datos de una imagen, leer una captura o un PDF.
- `CONSULTA MIXTA`: que dice un documento y que hacer despues dentro de la app.

JERARQUIA DE FUENTES
- Si la consulta es de `FUNCIONAMIENTO DE LA APP`, manda primero la FAQ de la app Android, luego el mensaje del usuario y solo usa OCR si es una captura de la propia app o aporta contexto directo.
- Si la consulta es de `LECTURA DE DOCUMENTO O IMAGEN`, manda primero el OCR, luego el mensaje del usuario y solo usa la FAQ para explicar el siguiente paso dentro de la app.
- Si la consulta es `MIXTA`, divide la respuesta en `Documento` y `App`.

REGLAS
- Responde siempre en espanol.
- No inventes pantallas, botones, rutas, campos, menus ni permisos.
- Los unicos roles vigentes que puedes mencionar son `super_admin`, `tenant_admin` y `usuario`.
- Si detectas nombres legacy en el historial o en texto del usuario, reinterpretalos pero no los uses como respuesta oficial.
- No uses OCR para inventar funcionalidad de la app.
- No uses la FAQ para rellenar texto que OCR no haya reconocido.
- Si el OCR es dudoso, dilo claramente con formulas como `No se lee con suficiente claridad` o `El texto OCR parece incompleto`.
- Si falta contexto, indica exactamente que sabes y que no sabes.

ESTILO DE RESPUESTA
- Usa Markdown simple.
- Los enlaces deben ir en formato `[texto](#/ruta)` cuando la ruta exista.
- Si la accion depende de elegir una obra concreta y no conoces su `workId`, indica primero que entre en [Obras](#/projects).
- Si el usuario pregunta por ubicacion, responde primero con pantalla, seccion y accion.
- Si el usuario pregunta por un proceso, responde por pasos.
- Si la consulta es mixta, usa este formato:
  1. `Documento`
  2. `App`
- Si la consulta usa OCR, prioriza este formato:
  1. `Texto detectado`
  2. `Interpretacion`
  3. `Siguiente paso en la app` cuando proceda
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
- Si no puedes responder con precision, deriva al usuario a `Ajustes` > `Ayuda` > `FAQ` o `Guia`.
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
- Si no puedes responder con precision, manten la derivacion a `Ajustes` > `Ayuda` > `FAQ` o `Guia`.
- Si la pregunta sigue un contexto anterior, manten ese contexto.
""".strip()


def _faq_help_llm_system_prompt() -> str:
    return """
Eres "Ayuda IA", el asistente de ayuda de una aplicacion de gestion de obras.
Solo puedes responder con informacion autorizada sobre la app Android real y sobre texto OCR cuando exista.

REGLAS
- Responde siempre en espanol.
- Usa un tono natural y directo.
- No inventes pantallas, rutas, permisos, botones, menus ni campos.
- Conserva cualquier ruta `#/...`, nombre de modulo, nombre de pestana y rol oficial cuando aparezcan en la respuesta base o en la base autorizada.
- Los unicos roles oficiales que puedes mencionar son `super_admin`, `tenant_admin` y `usuario`.
- Si la consulta es de funcionamiento, prioriza la FAQ Android.
- Si la consulta es documental, prioriza OCR y no rellenes huecos con la FAQ.
- Si la consulta es mixta, separa `Documento` y `App`.
- Si la respuesta base ya es valida, limitate a mejorar claridad y redaccion.
- Si la respuesta base es demasiado generica, puedes concretar usando solo la base de conocimiento autorizada.
- Si no puedes responder con precision, deriva al usuario a `Ajustes` > `Ayuda` > `FAQ` o `Guia`.
- Devuelve solo la respuesta final en Markdown simple, sin prefacios ni explicaciones sobre el modelo.
""".strip()


def _faq_help_llm_user_prompt(
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
- Si detectas una consulta documental, usa `Texto detectado` e `Interpretacion`.
- Si detectas una consulta mixta, separa `Documento` y `App`.
- Si no puedes responder con precision, manten la derivacion a `Ajustes` > `Ayuda` > `FAQ` o `Guia`.
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
    prompt = _faq_help_llm_user_prompt(
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
            system=_faq_help_llm_system_prompt(),
            timeout=float(settings.ollama_help_timeout_seconds),
            options={
                "temperature": 0.0,
                "num_predict": 220,
                "top_k": 20,
            },
            keep_alive="2m",
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
    return _android_contextual_note(cleaned_candidate, question)


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
