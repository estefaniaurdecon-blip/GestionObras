import json
import re
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.ai.client import OllamaClient, extract_json_block
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.api.deps import get_current_active_user
from app.core.config import settings
from app.models.user import User


router = APIRouter()


class OllamaAlbaranItem(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    unitPrice: float | None = None
    total: float | None = None


class OllamaAlbaranResponse(BaseModel):
    supplier: str | None = None
    invoiceNumber: str | None = None
    documentDate: str | None = None
    docType: Literal["MATERIALS_TABLE", "SERVICE_MACHINERY", "UNKNOWN"] = "UNKNOWN"
    items: list[OllamaAlbaranItem] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"
    warnings: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)


ALBARAN_JSON_PROMPT = """
Eres un extractor experto de ALBARANES y PARTES de trabajo de construccion en Espana.

Tu salida DEBE ser exclusivamente JSON valido (sin markdown, sin texto adicional).
Si no estas seguro de un campo, usa null.
No inventes valores.

Reglas de negocio:
1) supplier debe ser el EMISOR (proveedor), nunca labels tipo FECHA, TOTAL, PARTE DE TRABAJO, OBSERVACIONES.
2) invoiceNumber no puede ser telefono, CP, CIF/NIF ni codigo de cliente.
3) docType:
   - MATERIALS_TABLE solo si hay evidencia clara de tabla de materiales (descripcion + cantidad + precio/importe).
   - SERVICE_MACHINERY si detectas marcadores de servicio/maquinaria (horas, desglose jornada, bomba, operador, viajes, toneladas, m3).
   - UNKNOWN si no hay evidencia suficiente.
4) Si docType es SERVICE_MACHINERY o UNKNOWN, items debe ser [].
5) Si no hay precios/importes claros para imputacion economica, items debe ser [] y warnings debe incluir NO_PRICE_COLUMNS.
6) No meter en items direcciones, telefonos, CIF, observaciones o cabeceras.
7) documentDate debe estar en YYYY-MM-DD si se puede validar; si no, null.

JSON exacto de salida:
{
  "supplier": string | null,
  "invoiceNumber": string | null,
  "documentDate": "YYYY-MM-DD" | null,
  "docType": "MATERIALS_TABLE" | "SERVICE_MACHINERY" | "UNKNOWN",
  "items": [
    {
      "name": string,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "total": number | null
    }
  ],
  "confidence": "high" | "medium" | "low",
  "warnings": string[]
}
"""


SUPPLIER_STOPWORDS = {
    "FECHA",
    "ALBARAN",
    "ALBARÁN",
    "PARTE",
    "PARTE DE TRABAJO",
    "CLASE DE TRABAJO",
    "TOTAL",
    "SUBTOTAL",
    "OBSERVACIONES",
    "CLIENTE",
    "OBRA",
    "DESTINO",
    "ORIGEN",
    "CIF",
    "NIF",
    "DNI",
    "TELEFONO",
    "TEL",
    "FAX",
}


VALID_DOC_TYPES = {"MATERIALS_TABLE", "SERVICE_MACHINERY", "UNKNOWN"}
VALID_CONFIDENCE = {"high", "medium", "low"}
VALID_UNITS = {"ud", "uds", "un", "kg", "g", "l", "ml", "m", "m2", "m²", "m3", "m³", "h", "tn", "t", "paq", "caja"}


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _clean_upper(value: str) -> str:
    collapsed = re.sub(r"\s+", " ", value).strip()
    return _strip_accents(collapsed).upper()


def _parse_offline_result(raw_value: str | None) -> dict[str, Any]:
    if not raw_value:
        return {}
    try:
        parsed = json.loads(raw_value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _is_bad_supplier_candidate(value: str) -> bool:
    if not value:
        return True
    cleaned = _clean_upper(value)
    if len(cleaned) < 3:
        return True
    if cleaned in SUPPLIER_STOPWORDS:
        return True
    if any(word in cleaned for word in SUPPLIER_STOPWORDS):
        return True
    if re.search(r"\b(TEL|FAX|MOVIL|EMAIL|WWW|HTTP|CP)\b", cleaned):
        return True
    if re.search(r"\d{5,}", cleaned):
        return True
    return False


def _to_decimal(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if not isinstance(value, bool):
            return float(value)
        return None
    text = _normalize_text(value)
    if not text:
        return None
    normalized = text.replace(" ", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    try:
        return float(Decimal(normalized))
    except (InvalidOperation, ValueError):
        return None


def _normalize_unit(unit: Any) -> str | None:
    value = _normalize_text(unit).lower().replace(".", "")
    if not value:
        return None
    if value in {"m2"}:
        return "m²"
    if value in {"m3"}:
        return "m³"
    if value in VALID_UNITS:
        return value
    return None


def _normalize_date(value: Any) -> str | None:
    raw = _normalize_text(value)
    if not raw:
        return None
    iso_match = re.search(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b", raw)
    if iso_match:
        y, m, d = map(int, iso_match.groups())
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            return None
    es_match = re.search(r"\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2}|\d{2})\b", raw)
    if es_match:
        d, m, y_raw = es_match.groups()
        y = int(y_raw)
        if y < 100:
            y += 2000
        try:
            return date(y, int(m), int(d)).isoformat()
        except ValueError:
            return None
    return None


def _looks_like_phone_or_cp(value: str, raw_text: str) -> bool:
    compact = re.sub(r"\s+", "", value)
    if re.fullmatch(r"\d{9}", compact):
        return True
    if re.fullmatch(r"\d{5}", compact):
        raw_upper = _clean_upper(raw_text)
        if f"CP {compact}" in raw_upper or f"CODIGO POSTAL {compact}" in raw_upper:
            return True
    return False


def _normalize_invoice_number(value: Any, raw_text: str) -> str | None:
    candidate = _normalize_text(value)
    if not candidate:
        return None
    if len(candidate) < 3:
        return None
    if not re.search(r"[A-Za-z0-9]", candidate):
        return None
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/\-_.]*", candidate):
        return None
    if _looks_like_phone_or_cp(candidate, raw_text):
        return None
    return candidate


def _sanitize_items(items: Any) -> list[OllamaAlbaranItem]:
    if not isinstance(items, list):
        return []
    result: list[OllamaAlbaranItem] = []
    for raw_item in items:
        if not isinstance(raw_item, dict):
            continue
        name = _normalize_text(raw_item.get("name"))
        if len(name) < 2:
            continue
        upper_name = _clean_upper(name)
        if any(stop in upper_name for stop in ("TOTAL", "SUBTOTAL", "IVA", "OBSERVACIONES", "TELEFONO", "CIF", "NIF", "DNI", "EMAIL", "WWW")):
            continue
        quantity = _to_decimal(raw_item.get("quantity"))
        unit_price = _to_decimal(raw_item.get("unitPrice"))
        total = _to_decimal(raw_item.get("total"))
        result.append(
            OllamaAlbaranItem(
                name=name,
                quantity=quantity,
                unit=_normalize_unit(raw_item.get("unit")),
                unitPrice=unit_price,
                total=total,
            )
        )
    return result


def _build_ocr_payload_text(ocr_text: str, offline_result: dict[str, Any]) -> str:
    offline_json = json.dumps(offline_result, ensure_ascii=False) if offline_result else "{}"
    return (
        f"{ALBARAN_JSON_PROMPT}\n\n"
        "CONTEXTO OFFLINE (si viene vacio, ignorar):\n"
        f"{offline_json}\n\n"
        "TEXTO OCR DEL/LOS DOCUMENTO(S):\n"
        f"{ocr_text}\n"
    )


def _run_ollama_structured_extract(client: OllamaClient, prompt: str) -> dict[str, Any]:
    payload = {
        "model": settings.ollama_json_model,
        "prompt": prompt,
        "stream": False,
    }
    data = client._post_generate(payload, timeout=settings.ollama_timeout_secs)
    response_text = str(data.get("response", "")).strip()
    json_text = extract_json_block(response_text)
    try:
        parsed = json.loads(json_text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError as exc:
        raise AIInvalidResponseError("JSON inválido devuelto por Ollama para albarán") from exc


def _fallback_low_response(warnings: list[str], evidence: dict[str, Any]) -> OllamaAlbaranResponse:
    merged_warnings = list(dict.fromkeys([*warnings, "LLM_INVALID_JSON"]))
    return OllamaAlbaranResponse(
        supplier=None,
        invoiceNumber=None,
        documentDate=None,
        docType="UNKNOWN",
        items=[],
        confidence="low",
        warnings=merged_warnings,
        evidence=evidence,
    )


@router.post("/ollama-extract", response_model=OllamaAlbaranResponse)
async def ollama_extract_albaran(
    images: list[UploadFile] | None = File(default=None),
    offline_result_json: str | None = Form(default=None),
    current_user: User = Depends(get_current_active_user),
) -> OllamaAlbaranResponse:
    _ = current_user
    offline_result = _parse_offline_result(offline_result_json)
    offline_raw_text = _normalize_text(offline_result.get("rawText"))

    warnings: list[str] = []
    image_list = images or []
    evidence: dict[str, Any] = {
        "imageCount": len(image_list),
        "usedOfflineRawText": False,
        "offlineWarnings": offline_result.get("warnings") if isinstance(offline_result.get("warnings"), list) else [],
    }

    ocr_chunks: list[str] = []
    client = OllamaClient()

    if image_list:
        for image in image_list:
            data = await image.read()
            if not data:
                continue
            try:
                text = client.ocr_image_to_text(data)
                if text:
                    ocr_chunks.append(text)
            except AIUnavailableError:
                warnings.append("OLLAMA_OCR_UNAVAILABLE")
                break
            except AIInvalidResponseError:
                warnings.append("OLLAMA_OCR_INVALID")

    if not ocr_chunks and offline_raw_text:
        ocr_chunks.append(offline_raw_text)
        evidence["usedOfflineRawText"] = True

    ocr_text = "\n\n".join(chunk.strip() for chunk in ocr_chunks if chunk and chunk.strip())
    evidence["rawTextLength"] = len(ocr_text)

    if not ocr_text:
        return OllamaAlbaranResponse(
            supplier=None,
            invoiceNumber=None,
            documentDate=None,
            docType="UNKNOWN",
            items=[],
            confidence="low",
            warnings=list(dict.fromkeys([*warnings, "NO_OCR_TEXT"])),
            evidence=evidence,
        )

    prompt = _build_ocr_payload_text(ocr_text, offline_result)
    try:
        raw = _run_ollama_structured_extract(client, prompt)
    except AIUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo conectar con Ollama para mejorar el escaneo.",
        ) from exc
    except AIInvalidResponseError:
        return _fallback_low_response(warnings, evidence)

    doc_type_raw = _normalize_text(raw.get("docType")).upper()
    doc_type = doc_type_raw if doc_type_raw in VALID_DOC_TYPES else "UNKNOWN"

    confidence_raw = _normalize_text(raw.get("confidence")).lower()
    confidence = confidence_raw if confidence_raw in VALID_CONFIDENCE else "low"

    extracted_warnings = raw.get("warnings") if isinstance(raw.get("warnings"), list) else []
    cleaned_warnings = [str(w).strip() for w in extracted_warnings if str(w).strip()]
    warnings = list(dict.fromkeys([*warnings, *cleaned_warnings]))

    supplier = _normalize_text(raw.get("supplier")) or None
    if supplier and _is_bad_supplier_candidate(supplier):
        supplier = None
        warnings.append("AMBIGUOUS_PROVIDER")

    invoice_number = _normalize_invoice_number(raw.get("invoiceNumber"), ocr_text)
    if raw.get("invoiceNumber") and invoice_number is None:
        warnings.append("INVALID_INVOICE_NUMBER")

    document_date = _normalize_date(raw.get("documentDate"))
    if raw.get("documentDate") and document_date is None:
        warnings.append("INVALID_DATE")

    items = _sanitize_items(raw.get("items"))

    if doc_type != "MATERIALS_TABLE":
        items = []
    else:
        has_prices = any(item.unitPrice is not None or item.total is not None for item in items)
        if not has_prices:
            items = []
            warnings.append("NO_PRICE_COLUMNS")

    response = OllamaAlbaranResponse(
        supplier=supplier,
        invoiceNumber=invoice_number,
        documentDate=document_date,
        docType=doc_type,  # type: ignore[arg-type]
        items=items,
        confidence=confidence,  # type: ignore[arg-type]
        warnings=list(dict.fromkeys(warnings)),
        evidence=evidence,
    )

    return response
