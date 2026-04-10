import base64
import json
import re
from datetime import date
from typing import Any, Dict, Optional
import time
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.ai.prompts import INVOICE_JSON_PROMPT, OCR_PROMPT, PROMPT_VERSION
from app.core.config import settings


# ============================================================
# HEADERS
# ============================================================

def _parse_headers(headers_json: Optional[str]) -> Dict[str, str]:
    if not headers_json:
        return {}
    try:
        parsed = json.loads(headers_json)
    except json.JSONDecodeError as exc:
        raise AIInvalidResponseError("OLLAMA_HEADERS_JSON inválido") from exc
    if not isinstance(parsed, dict):
        raise AIInvalidResponseError("OLLAMA_HEADERS_JSON debe ser un objeto JSON")
    return {str(k): str(v) for k, v in parsed.items()}


_LOCAL_OLLAMA_HOSTS = (
    "host.docker.internal",
    "localhost",
    "127.0.0.1",
)


def _candidate_base_urls(base_url: str) -> list[str]:
    normalized = str(base_url or "").strip().rstrip("/")
    if not normalized:
        return []

    try:
        parsed = urlsplit(normalized)
    except ValueError:
        return [normalized]

    host = parsed.hostname or ""
    if not parsed.scheme or not parsed.netloc or host not in _LOCAL_OLLAMA_HOSTS:
        return [normalized]

    auth = ""
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth = f"{auth}:{parsed.password}"
        auth = f"{auth}@"

    candidates: list[str] = []
    for candidate_host in _LOCAL_OLLAMA_HOSTS:
        netloc = f"{auth}{candidate_host}"
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        candidate_url = urlunsplit(
            (parsed.scheme, netloc, parsed.path.rstrip("/"), parsed.query, parsed.fragment)
        ).rstrip("/")
        if candidate_url and candidate_url not in candidates:
            candidates.append(candidate_url)
    return candidates or [normalized]


# ============================================================
# CLIENT
# ============================================================

class OllamaClient:
    """Cliente HTTP mínimo para Ollama remoto."""

    def __init__(self) -> None:
        self.base_urls = _candidate_base_urls(settings.ollama_base_url)
        self.base_url = self.base_urls[0] if self.base_urls else ""
        self.default_headers = _parse_headers(settings.ollama_headers_json)

    def _ordered_base_urls(self) -> list[str]:
        ordered: list[str] = []
        for candidate in [self.base_url, *self.base_urls]:
            cleaned = str(candidate or "").strip().rstrip("/")
            if cleaned and cleaned not in ordered:
                ordered.append(cleaned)
        return ordered

    def _post_generate(
        self,
        payload: Dict[str, Any],
        timeout: float,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """Post a generate request with retry logic."""
        base_urls = self._ordered_base_urls()
        if not base_urls:
            raise AIUnavailableError("OLLAMA_BASE_URL no configurado")

        last_error: AIUnavailableError | None = None
        for base_url in base_urls:
            url = f"{base_url}/api/generate"
            for attempt in range(max_retries):
                try:
                    with httpx.Client(timeout=timeout) as client:
                        response = client.post(url, json=payload, headers=self.default_headers)
                        response.raise_for_status()
                        self.base_url = base_url
                        return response.json()
                except httpx.TimeoutException as exc:
                    last_error = AIUnavailableError(
                        f"Timeout con Ollama en {base_url} despu?s de {max_retries} intentos"
                    )
                    if attempt == max_retries - 1:
                        break
                    time.sleep(1)
                except httpx.ConnectError as exc:
                    last_error = AIUnavailableError(
                        f"Error de conexi?n con Ollama en {base_url}: {exc}"
                    )
                    break
                except httpx.HTTPError as exc:
                    last_error = AIUnavailableError(
                        f"Error HTTP con Ollama en {base_url}: {exc}"
                    )
                    break

        if last_error is not None:
            raise last_error
        raise AIUnavailableError("No se pudo conectar con Ollama")

    def health_check(self, timeout: float = 5.0) -> bool:
        """Check if Ollama service is available."""
        for base_url in self._ordered_base_urls():
            url = f"{base_url}/api/tags"
            try:
                with httpx.Client(timeout=timeout) as client:
                    client.get(url, headers=self.default_headers).raise_for_status()
                self.base_url = base_url
                return True
            except httpx.HTTPError:
                continue
            except httpx.RequestError:
                continue
        return False

    def generate_text(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        timeout: Optional[float] = None,
        options: Optional[Dict[str, Any]] = None,
        keep_alive: Optional[str] = None,
    ) -> str:
        """Generate plain text with a generic completion model."""
        chosen_model = str(model or settings.ollama_json_model or "").strip()
        if not chosen_model:
            raise AIInvalidResponseError("OLLAMA_HELP_MODEL no configurado")

        payload: Dict[str, Any] = {
            "model": chosen_model,
            "prompt": prompt,
            "stream": False,
        }
        if system:
            payload["system"] = system
        if options:
            payload["options"] = options
        if keep_alive:
            payload["keep_alive"] = keep_alive

        data = self._post_generate(payload, timeout=timeout or settings.ollama_timeout_secs)
        return str(data.get("response", "")).strip()

    def ocr_image_to_text(self, image_bytes: bytes) -> str:
        """Extract text from image using OCR model."""
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
        """Convert invoice text to structured JSON."""
        trimmed = _trim_invoice_text(text)
        full_text = text or ""

        payload = {
            "model": settings.ollama_json_model,
            "prompt": f"{INVOICE_JSON_PROMPT}\n\nTEXTO:\n{trimmed}\n",
            "stream": False,
        }

        data = self._post_generate(payload, timeout=settings.ollama_json_timeout_seconds)
        response_text = str(data.get("response", "")).strip()

        json_text = extract_json_block(response_text)

        try:
            raw = json.loads(json_text)
        except json.JSONDecodeError as exc:
            raise AIInvalidResponseError(
                f"JSON inválido devuelto por el LLM: {json_text[:200]}"
            ) from exc

        return normalize_invoice_json(raw, fallback_text=full_text)


# ============================================================
# JSON EXTRACTION
# ============================================================

def extract_json_block(text: str) -> str:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Intenta encontrar bloques markdown primero
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if json_match:
        return json_match.group(1)
    
    # Fallback: buscar primer objeto JSON válido
    start = text.find("{")
    if start == -1:
        raise AIInvalidResponseError("No se encontró JSON en la respuesta")

    depth = 0
    in_string = False
    escape_next = False
    
    for i in range(start, len(text)):
        char = text[i]
        
        # Manejar strings para evitar contar llaves dentro de strings
        if char == '"' and not escape_next:
            in_string = not in_string
        elif char == '\\' and in_string:
            escape_next = True
            continue
        
        if not in_string:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        
        escape_next = False

    raise AIInvalidResponseError("JSON incompleto en la respuesta")


def build_extraction_meta() -> Dict[str, Any]:
    """Build metadata about the extraction process."""
    return {
        "prompt_version": PROMPT_VERSION,
        "ocr_model": settings.ollama_ocr_model,
        "json_model": settings.ollama_json_model,
    }


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_invoice_json(raw: Dict[str, Any], fallback_text: str = "") -> Dict[str, Any]:
    """Normalize raw LLM JSON output to standard format."""
    if not isinstance(raw, dict):
        raw = {}

    def pick(*keys: str):
        """Pick first available key (case-insensitive)."""
        for key in keys:
            if key in raw:
                return raw[key]
            for rk in raw:
                if rk.lower() == key.lower():
                    return raw[rk]
        return None

    # Extraer campos
    supplier_name = pick("supplier_name", "supplier", "vendor", "proveedor", "emisor")
    supplier_tax_id = pick("supplier_tax_id", "vat", "nif", "cif", "tax_id")
    invoice_number = pick("invoice_number", "num_factura", "number", "numero")
    issue_date_val = pick("issue_date", "fecha_emision", "date", "fecha")
    due_date_val = pick("due_date", "fecha_vencimiento", "vencimiento")
    total_amount_val = pick("total_amount", "total", "importe", "amount")
    currency = pick("currency", "moneda")
    concept = pick("concept", "concepto", "description", "descripcion")

    # Fallbacks con regex
    if not invoice_number:
        invoice_number = _regex_invoice_number(fallback_text)
    if not due_date_val:
        due_date_val = _regex_due_date(fallback_text)

    # Normalizar tax_id y nombre
    supplier_tax_id_norm = _normalize_tax_id(_as_str_or_none(supplier_tax_id))
    supplier_name_norm = _as_str_or_none(supplier_name)
    invoice_number_str = _as_str_or_none(invoice_number)

    # Intentar mejorar supplier_name si es necesario
    if supplier_tax_id_norm and (
        supplier_name_norm is None
        or _looks_like_customer(supplier_name_norm)
        or _looks_like_bad_supplier_name(supplier_name_norm, invoice_number_str)
    ):
        guessed = _find_supplier_name_by_tax_id(fallback_text, supplier_tax_id_norm)
        if guessed and not _looks_like_bad_supplier_name(guessed, invoice_number_str):
            supplier_name_norm = guessed
        else:
            header_guess = _find_supplier_name_in_header(fallback_text)
            supplier_name_norm = (
                header_guess
                if header_guess and not _looks_like_bad_supplier_name(header_guess, invoice_number_str)
                else supplier_name_norm  # Mantener el original si no hay mejor opción
            )

    result = {
        "supplier_name": supplier_name_norm,
        "supplier_tax_id": supplier_tax_id_norm,
        "invoice_number": invoice_number_str,
        "issue_date": _normalize_date(issue_date_val),
        "due_date": _normalize_date(due_date_val),
        "total_amount": _normalize_amount(total_amount_val),
        "currency": _normalize_currency(currency, fallback_text),
        "concept": _as_str_or_none(concept),
    }

    return result


# ============================================================
# HELPERS
# ============================================================

def _looks_like_bad_supplier_name(name: Optional[str], invoice_number: Optional[str]) -> bool:
    """Check if extracted supplier name looks invalid."""
    if not name:
        return True
    
    up = name.upper()
    
    # Palabras que indican que no es un nombre de proveedor
    bad_keywords = [
        "FACTURA", "INVOICE", "NUM", "Nº", "N°", "TOTAL", "IMPORTE", 
        "CLIENTE", "CUSTOMER", "AMOUNT", "FECHA", "DATE"
    ]
    if any(keyword in up for keyword in bad_keywords):
        return True
    
    # Si contiene el número de factura, probablemente no es el nombre
    if invoice_number and invoice_number.upper() in up:
        return True
    
    # Si tiene números de 5+ dígitos seguidos, probablemente no es nombre
    if re.search(r'\b\d{5,}\b', up):
        return True
    
    # Si es demasiado largo
    if len(name) > 80:
        return True
    
    # Si es muy corto (menos de 3 caracteres)
    if len(name.strip()) < 3:
        return True
    
    return False


def _looks_like_customer(name: Optional[str]) -> bool:
    """Check if name looks like customer instead of supplier."""
    if not name:
        return False
    up = name.upper()
    # Añade aquí nombres de clientes comunes en tu sistema
    customer_keywords = ["URDECON", "CONSTRUCCIONES"]
    return any(keyword in up for keyword in customer_keywords)


def _as_str_or_none(value: Any) -> Optional[str]:
    """Convert value to string or None."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _normalize_tax_id(value: Optional[str]) -> Optional[str]:
    """Normalize Spanish tax ID (NIF/CIF)."""
    if not value:
        return None
    # Eliminar espacios y caracteres especiales
    v = re.sub(r'[^A-Za-z0-9]', '', value).upper()
    # Remover prefijo ES si existe
    if v.startswith("ES"):
        v = v[2:]
    return v if v else None


def _normalize_date(value: Any) -> Optional[str]:
    """Normalize date to ISO format (YYYY-MM-DD)."""
    if isinstance(value, date):
        return value.isoformat()
    if not value:
        return None
    
    value_str = str(value).strip()
    
    # Intenta formato ISO primero (YYYY-MM-DD)
    iso_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', value_str)
    if iso_match:
        y, m, d = map(int, iso_match.groups())
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            pass
    
    # Formato europeo DD/MM/YYYY o DD-MM-YYYY
    eu_match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', value_str)
    if eu_match:
        d, m, y = map(int, eu_match.groups())
        if y < 100:
            y += 2000
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            # Si falla, intenta intercambiar día y mes (formato americano)
            try:
                return date(y, d, m).isoformat()
            except ValueError:
                pass
    
    # Formato con nombre de mes (ej: "15 de enero de 2024")
    month_names = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
    }
    
    for month_name, month_num in month_names.items():
        if month_name in value_str.lower():
            # Buscar día y año
            day_match = re.search(r'\b(\d{1,2})\b', value_str)
            year_match = re.search(r'\b(20\d{2})\b', value_str)
            if day_match and year_match:
                try:
                    return date(int(year_match.group(1)), month_num, int(day_match.group(1))).isoformat()
                except ValueError:
                    pass
    
    return None


def _normalize_amount(value: Any) -> Optional[float]:
    """Normalize monetary amount to float."""
    if isinstance(value, (int, float)):
        return float(value)
    if not value:
        return None
    
    s = str(value).strip()
    
    # Eliminar símbolos de moneda
    s = re.sub(r'[€$£¥]', '', s).strip()
    
    # Eliminar espacios
    s = s.replace(' ', '')
    
    # Detectar formato europeo (1.234,56) vs americano (1,234.56)
    if ',' in s and '.' in s:
        # Tiene ambos separadores
        last_comma = s.rfind(',')
        last_dot = s.rfind('.')
        
        if last_comma > last_dot:
            # Formato europeo: 1.234,56 o 1.234.567,89
            s = s.replace('.', '').replace(',', '.')
        else:
            # Formato americano: 1,234.56
            s = s.replace(',', '')
    elif ',' in s:
        # Solo comas
        parts = s.split(',')
        if len(parts[-1]) == 2:
            # Probablemente decimal europeo: 1234,56
            s = s.replace(',', '.')
        else:
            # Probablemente separador de miles: 1,234
            s = s.replace(',', '')
    elif '.' in s:
        # Solo puntos
        parts = s.split('.')
        if len(parts) > 2:
            # Formato europeo con múltiples puntos: 1.234.567
            s = s.replace('.', '')
        elif len(parts) == 2 and len(parts[-1]) != 2:
            # Probablemente separador de miles europeo: 1.234
            s = s.replace('.', '')
    
    try:
        result = float(s)
        return result if result >= 0 else None
    except ValueError:
        return None


def _normalize_currency(value: Any, text: str) -> Optional[str]:
    """Normalize currency code."""
    if value:
        value_str = str(value).upper()
        if "EUR" in value_str or "€" in value_str:
            return "EUR"
        if "USD" in value_str or "$" in value_str:
            return "USD"
        if "GBP" in value_str or "£" in value_str:
            return "GBP"
    
    # Fallback: buscar en el texto
    if "€" in text or "EUR" in text.upper() or "EURO" in text.upper():
        return "EUR"
    if "$" in text or "USD" in text.upper() or "DOLLAR" in text.upper():
        return "USD"
    if "£" in text or "GBP" in text.upper() or "POUND" in text.upper():
        return "GBP"
    
    # Default para España
    return "EUR"


def _trim_invoice_text(text: str, max_chars: int = 9000) -> str:
    """Trim text to maximum length for LLM processing."""
    if not text:
        return ""
    return text[:max_chars]


def _regex_invoice_number(text: str) -> Optional[str]:
    """Extract invoice number using regex patterns."""
    # Múltiples patrones para diferentes formatos de factura
    patterns = [
        r'\b[A-Z]{1,4}[-/]\d{4}[-/]\d+\b',  # FC-2024-001
        r'\b[A-Z]\d{1,4}[-/]\d+\b',          # A123-456
        r'\b\d{4}[-/]\d{3,}\b',              # 2024/001, 2024-123
        r'\bF[Aa]?[Cc]?[Tt]?[Uu]?[Rr]?[Aa]?\s*[Nn]?[º°]?\s*:?\s*(\d+[-/]\d+)\b',  # FACTURA Nº: 2024/001
        r'\b[Nn][º°]?\s*(\d+[-/]\d+)\b',     # Nº 2024/001
        r'\b[Nn]umber\s*:?\s*([A-Z0-9-/]+)\b',  # Number: INV-001
    ]
    
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            # Si el patrón tiene grupo de captura, usar ese grupo
            return m.group(1) if m.lastindex else m.group(0).strip()
    
    return None


def _regex_due_date(text: str) -> Optional[str]:
    """Extract due date using regex."""
    # Buscar "vencimiento" o "due date" seguido de fecha
    patterns = [
        r'[Vv]encimiento\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'[Dd]ue\s+[Dd]ate\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'[Ff]echa\s+[Vv]encimiento\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
    ]
    
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            return m.group(1)
    
    # Fallback: buscar cualquier fecha después de mencionar vencimiento
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if 'vencimiento' in line.lower() or 'due date' in line.lower():
            # Buscar fecha en esta línea o las siguientes 2 líneas
            for j in range(i, min(i + 3, len(lines))):
                date_match = re.search(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b', lines[j])
                if date_match:
                    return date_match.group(1)
    
    return None


def _find_supplier_name_by_tax_id(text: str, tax_id: str) -> Optional[str]:
    """Find supplier name near the tax ID in text."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    
    for i, line in enumerate(lines):
        # Buscar línea que contenga el tax_id (sin espacios)
        if tax_id in line.replace(" ", "").replace("-", ""):
            # Mirar líneas anteriores (el nombre suele estar arriba)
            for offset in range(1, min(4, i + 1)):
                candidate = lines[i - offset]
                # Filtrar líneas que parecen ser nombres válidos
                if (
                    len(candidate) > 3
                    and not re.search(r'^\d+$', candidate)  # No solo números
                    and not any(kw in candidate.upper() for kw in ['FACTURA', 'CIF', 'NIF', 'TAX'])
                ):
                    return candidate
    
    return None


def _find_supplier_name_in_header(text: str) -> Optional[str]:
    """Find supplier name in document header (first lines)."""
    # Buscar en las primeras 30 líneas
    for line in text.splitlines()[:30]:
        line = line.strip()
        # Buscar líneas con S.L., S.A., S.L.U., etc.
        if re.search(r'\b(S\.?L\.?|S\.?A\.?|S\.?L\.?U\.?|LTD|LLC|INC)\b', line, re.IGNORECASE):
            # Verificar que tenga longitud razonable
            if 3 < len(line) < 80:
                return line
    
    return None
