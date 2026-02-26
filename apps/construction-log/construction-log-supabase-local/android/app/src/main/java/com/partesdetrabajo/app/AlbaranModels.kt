package com.partesdetrabajo.app

enum class ParsedDocType {
    MATERIALS_TABLE,
    SERVICE_MACHINERY,
    UNKNOWN,
}

data class ParsedItem(
    val material: String,
    val quantity: Double?,
    val unit: String?,
    val unitPrice: Double?,
    val costDoc: Double?,
    val rowText: String,
    val missingCritical: Boolean,
)

data class ParsedFieldConfidence(
    val supplier: Double? = null,
    val invoiceNumber: Double? = null,
    val documentDate: Double? = null,
    val table: Double? = null,
)

data class ParsedFieldWarnings(
    val supplier: List<String> = emptyList(),
    val invoiceNumber: List<String> = emptyList(),
    val documentDate: List<String> = emptyList(),
    val table: List<String> = emptyList(),
)

data class ParsedDeliveryNote(
    val supplier: String?,
    val supplierNormalized: String?,
    val invoiceNumber: String?,
    val documentDate: String?,
    val docType: ParsedDocType,
    val serviceDescription: String?,
    val items: List<ParsedItem>,
    val confidence: String,
    val warnings: List<String>,
    val rawText: String,
    val score: Double,
    val profileUsed: String,
    val fieldConfidence: ParsedFieldConfidence,
    val fieldWarnings: ParsedFieldWarnings,
    val requiresReview: Boolean,
    val reviewReason: String?,
    val headerDetected: Boolean,
    val docSubtype: String? = null,
    val fieldMeta: Map<String, Any?>? = null,
    val templateData: Map<String, Any?>? = null,
)

data class OcrLine(
    val text: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val page: Int,
)
