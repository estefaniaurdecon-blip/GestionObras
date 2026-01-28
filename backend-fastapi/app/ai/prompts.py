PROMPT_VERSION = "v1"

# Prompt para OCR con modelo multimodal.
OCR_PROMPT = (
    "Extrae todo el texto legible del documento. "
    "Devuelve solo texto plano sin explicaciones."
)

# Prompt para convertir texto de factura a JSON estricto.
INVOICE_JSON_PROMPT = (
    "Eres un asistente que extrae datos estructurados de facturas. "
    "Devuelve SOLO un JSON valido (sin markdown) con estas claves exactas:\n"
    "supplier_name, supplier_tax_id, invoice_number, issue_date, due_date, "
    "total_amount, currency, concept.\n"
    "Si un campo no existe, pon null. No inventes valores."
)
