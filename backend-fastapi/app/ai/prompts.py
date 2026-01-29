"""
Prompts de IA para OCR y extracción de facturas.

Regla:
- SOLO un prompt activo (el último).
- Los anteriores se conservan como histórico (NO USAR).
"""

# ======================
# METADATA
# ======================

PROMPT_VERSION = "v3"  # <<< ACTIVO


# ======================
# OCR PROMPT (común)
# ======================

OCR_PROMPT = (
    "Extrae TODO el texto legible del documento de forma COMPLETA y PRECISA. "
    "Es CRÍTICO que extraigas el texto desde la PRIMERA LÍNEA hasta la última. "
    "NO omitas el encabezado, nombres de empresas, logos o información en la parte superior. "
    "Mantén el orden de lectura natural (de arriba a abajo, de izquierda a derecha). "
    "Devuelve SOLO texto plano, sin explicaciones ni comentarios."
)


# ============================================================
# PROMPT ACTIVO (v3)  <<< USAR ESTE
# ============================================================

INVOICE_JSON_PROMPT = """
Eres un extractor experto de datos de FACTURAS en España.

REGLAS CRÍTICAS (MUY IMPORTANTE):
1. supplier_* SIEMPRE es el EMISOR de la factura (proveedor/vendedor).
   - El nombre del emisor suele estar en la PARTE SUPERIOR del documento, a menudo con el logo.
   - Busca especialmente en las PRIMERAS LÍNEAS del texto.
2. El CLIENTE / Customer / Cliente / Destinatario NUNCA es supplier.
3. Si ves "CONSTRUCCIONES URDECON" o "URDECON", esto es el CLIENTE, NO el proveedor.
4. Si aparecen datos de cliente y de emisor, usa SOLO los del EMISOR.
5. NO confundas cliente con proveedor bajo ninguna circunstancia.
6. El CIF/NIF del emisor normalmente está cerca del nombre de la empresa emisora EN LA CABECERA.

DÓNDE BUSCAR EL PROVEEDOR:
- Mira las PRIMERAS 5-10 LÍNEAS del documento
- Busca nombres con "S.L.", "S.A.", "S.L.U."
- El proveedor suele tener su nombre, dirección, CIF y contacto en la parte superior
- Si ves un nombre de empresa seguido de dirección y CIF al inicio, ESE es el proveedor

FORMATO DE SALIDA OBLIGATORIO:
- Devuelve SOLO un objeto JSON válido (sin ```json, sin markdown, sin texto adicional).
- Fechas SIEMPRE en formato ISO: YYYY-MM-DD (ej: 2025-07-31).
- Importes como número decimal con punto (ej: 29040.00).
  - Si viene "29.040,00" (formato español) conviértelo a 29040.00
  - Si viene "29.040" conviértelo a 29040.00
  - Si viene "29,040.00" (formato anglosajón) conviértelo a 29040.00
- currency debe ser "EUR" si aparece €, "Euros", "euros" o "EUROS".

CLAVES EXACTAS DEL JSON (NO AÑADIR NI CAMBIAR NINGUNA):
{
  "supplier_name": string o null,
  "supplier_tax_id": string o null,
  "invoice_number": string o null,
  "issue_date": string (YYYY-MM-DD) o null,
  "due_date": string (YYYY-MM-DD) o null,
  "total_amount": number o null,
  "currency": string o null,
  "concept": string o null
}

GUÍA DE EXTRACCIÓN:
- supplier_name: Nombre de la empresa que EMITE la factura. NO uses "CONSTRUCCIONES URDECON" ni "URDECON" ya que son el cliente.
- supplier_tax_id: NIF/CIF del emisor (puede empezar con ES). Formato: A12345678, B12345678, etc. NO uses A30032205 si está asociado a URDECON.
- invoice_number: Número de factura único (ej: "A 1600", "P22-25-0194", "2024/001").
- issue_date: "Fecha factura", "Fecha emisión", "FECHA" al inicio del documento.
- due_date: "Vencimiento", "Fecha vencimiento", fecha en la sección de vencimientos.
- total_amount: "TOTAL" final con IVA incluido. Busca el número más grande al final.
- currency: Moneda de la factura (normalmente "EUR" si estás en España).
- concept: Descripción breve del servicio/producto principal.

VALIDACIONES:
- Si un campo no existe, no es visible, o no estás seguro, pon null.
- NO inventes valores.
- NO uses datos del cliente como si fueran del proveedor.
- Si "URDECON" aparece como supplier_name, está MAL - busca el nombre real del emisor.

EJEMPLO DE RESPUESTA CORRECTA:
{
  "supplier_name": "MAQHERSAN S.L.",
  "supplier_tax_id": "B73123456",
  "invoice_number": "A 1600",
  "issue_date": "2025-12-30",
  "due_date": "2026-03-30",
  "total_amount": 9876.75,
  "currency": "EUR",
  "concept": "Material para proyecto CO2 mineralizado"
}
"""


# ============================================================
# HISTÓRICO (NO USAR)
# ============================================================

# ---------- v1 (ORIGINAL) ----------
INVOICE_JSON_PROMPT_V1 = (
    "Eres un asistente que extrae datos estructurados de facturas. "
    "Devuelve SOLO un JSON válido (sin markdown) con estas claves exactas:\n"
    "supplier_name, supplier_tax_id, invoice_number, issue_date, due_date, "
    "total_amount, currency, concept.\n"
    "Si un campo no existe, pon null. No inventes valores."
)

# ---------- v2 (MEJORA INTERMEDIA) ----------
INVOICE_JSON_PROMPT_V2 = """
Eres un extractor de datos de FACTURAS en España.

IMPORTANTE:
- "supplier_*" es el EMISOR de la factura (proveedor/empresa que factura), NO el cliente.
- Si aparece "Cliente/Customer", eso NO es supplier.
- Devuelve SOLO JSON válido (sin markdown, sin texto extra).
- Fechas en formato ISO: YYYY-MM-DD.
- Importes: número decimal con punto (ej 29040.00). Si viene "29.040,00", conviértelo.
- currency usa "EUR" si aparece "Euros" o símbolo €.

Claves EXACTAS:
supplier_name, supplier_tax_id, invoice_number, issue_date, due_date, total_amount, currency, concept

Guía de extracción:
- invoice_number: suele ser el nº de factura (p.ej. "P22-25-0194")
- issue_date: "Fecha factura/Invoice date" o "Fecha expedición/Issue date"
- due_date: "Vencimientos/Due date" o fecha junto a forma de pago (p.ej. "TRANSFERENCIA 31/07/25")
- total_amount: "Total factura/Total invoice"
- concept: primera línea de descripción principal (p.ej. "Proyecto ...")

Si un campo no existe, pon null. No inventes valores.
"""