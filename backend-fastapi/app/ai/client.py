import base64
import json
from typing import Any, Dict, Optional

import httpx

from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.ai.prompts import INVOICE_JSON_PROMPT, OCR_PROMPT, PROMPT_VERSION
from app.core.config import settings


def _parse_headers(headers_json: Optional[str]) -> Dict[str, str]:
    if not headers_json:
        return {}
    try:
        parsed = json.loads(headers_json)
    except json.JSONDecodeError as exc:
        raise AIInvalidResponseError("OLLAMA_HEADERS_JSON invalido") from exc
    if not isinstance(parsed, dict):
        raise AIInvalidResponseError("OLLAMA_HEADERS_JSON debe ser un objeto JSON")
    return {str(k): str(v) for k, v in parsed.items()}


class OllamaClient:
    """Cliente HTTP minimo para Ollama remoto."""

    def __init__(self) -> None:
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.default_headers = _parse_headers(settings.ollama_headers_json)

    def _post_generate(self, payload: Dict[str, Any], timeout: float) -> Dict[str, Any]:
        url = f"{self.base_url}/api/generate"
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, json=payload, headers=self.default_headers)
                response.raise_for_status()
                return response.json()
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            raise AIUnavailableError("Timeout/Conexion con Ollama") from exc
        except httpx.HTTPError as exc:
            raise AIUnavailableError("Error HTTP con Ollama") from exc

    def health_check(self, timeout: float) -> bool:
        url = f"{self.base_url}/api/tags"
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.get(url, headers=self.default_headers)
                response.raise_for_status()
            return True
        except httpx.HTTPError:
            return False

    def ocr_image_to_text(self, image_bytes: bytes) -> str:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": settings.ollama_ocr_model,
            "prompt": OCR_PROMPT,
            "stream": False,
            "images": [encoded],
        }
        data = self._post_generate(payload, timeout=settings.ollama_ocr_timeout_seconds)
        return str(data.get("response", "")).strip()

    def invoice_text_to_json(self, text: str) -> Dict[str, Any]:
        prompt = f"{INVOICE_JSON_PROMPT}\n\nTEXTO:\n{text}\n"
        payload = {
            "model": settings.ollama_json_model,
            "prompt": prompt,
            "stream": False,
        }
        data = self._post_generate(payload, timeout=settings.ollama_json_timeout_seconds)
        response_text = str(data.get("response", "")).strip()
        json_text = extract_json_block(response_text)
        try:
            return json.loads(json_text)
        except json.JSONDecodeError as exc:
            raise AIInvalidResponseError("JSON invalido devuelto por el LLM") from exc


def extract_json_block(text: str) -> str:
    """
    Extrae el primer bloque JSON de un texto libre.
    """
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise AIInvalidResponseError("No se encontro JSON en la respuesta")
    return text[start : end + 1]


def build_extraction_meta() -> Dict[str, Any]:
    """Metadata uniforme para auditoria/extraccion."""
    return {
        "prompt_version": PROMPT_VERSION,
        "ocr_model": settings.ollama_ocr_model,
        "json_model": settings.ollama_json_model,
    }


def normalize_invoice_json(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normaliza claves comunes a las esperadas por el extractor.
    """
    if not isinstance(raw, dict):
        return {}

    def pick(*keys: str):
        for key in keys:
            if key in raw:
                return raw[key]
            # Busca por coincidencia case-insensitive.
            for raw_key in raw.keys():
                if raw_key.lower() == key.lower():
                    return raw[raw_key]
        return None

    return {
        "supplier_name": pick(
            "supplier_name",
            "supplier",
            "vendor",
            "proveedor",
            "cliente",
            "client",
            "customer",
            "customer_name",
        ),
        "supplier_tax_id": pick(
            "supplier_tax_id",
            "supplier_taxid",
            "supplier_vat",
            "tax_id",
            "taxid",
            "vat",
            "nif",
            "cif",
        ),
        "invoice_number": pick(
            "invoice_number",
            "invoice_no",
            "invoice_num",
            "num_factura",
            "numero_factura",
            "number",
        ),
        "issue_date": pick(
            "issue_date",
            "invoice_date",
            "fecha_emision",
            "fecha_factura",
            "date",
        ),
        "due_date": pick(
            "due_date",
            "payment_due_date",
            "fecha_vencimiento",
            "vencimiento",
            "due",
        ),
        "total_amount": pick(
            "total_amount",
            "total",
            "importe",
            "amount_total",
            "invoice_total",
        ),
        "currency": pick("currency", "moneda", "curr"),
        "concept": pick("concept", "concepto", "description", "details"),
    }
