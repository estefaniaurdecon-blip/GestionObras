package com.partesdetrabajo.app

import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Call
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import java.text.Normalizer
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

private interface AlbaranDocIntApiService {
    @Multipart
    @POST("api/v1/albaranes/process")
    fun processAlbaran(
        @Header("Authorization") authorization: String?,
        @Part file: MultipartBody.Part,
    ): Call<DocIntProxyResponse>
}

private data class DocIntFieldDto(
    val value: String? = null,
    val confidence: Double? = null,
)

private data class DocIntItemDto(
    val reference: String? = null,
    val description: String? = null,
    val quantity: Double? = null,
    val unit: String? = null,
    val unitPrice: Double? = null,
    val lineTotal: Double? = null,
    val confidence: Double? = null,
)

private data class DocIntTotalsDto(
    val subtotal: Double? = null,
    val tax: Double? = null,
    val total: Double? = null,
)

private data class DocIntProxyResponse(
    val success: Boolean? = null,
    val source: String? = null,
    val docType: String? = null,
    val docSubtype: String? = null,
    val supplier: DocIntFieldDto? = null,
    val invoiceNumber: DocIntFieldDto? = null,
    val documentDate: DocIntFieldDto? = null,
    val items: List<DocIntItemDto>? = null,
    val totals: DocIntTotalsDto? = null,
    val fieldMeta: Map<String, Any?>? = null,
    val templateData: Map<String, Any?>? = null,
    val docIntMeta: Map<String, Any?>? = null,
    val warnings: List<String>? = null,
    val processingTimeMs: Long? = null,
)

class AlbaranDocIntClient(
    baseUrl: String,
    timeoutMs: Long = 60_000L,
) {
    companion object {
        private val validUnits = mapOf(
            "UD" to "ud",
            "UDS" to "ud",
            "UN" to "ud",
            "UNID" to "ud",
            "KG" to "kg",
            "G" to "g",
            "L" to "l",
            "LT" to "l",
            "ML" to "ml",
            "M" to "m",
            "M2" to "m2",
            "MÂ²" to "m2",
            "M3" to "m3",
            "MÂ³" to "m3",
            "H" to "h",
            "TN" to "tn",
            "T" to "tn",
            "PAQ" to "paq",
            "CAJA" to "caja",
        )
    }

    private val service: AlbaranDocIntApiService

    init {
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val connectTimeoutMs = timeoutMs.coerceAtMost(8_000L)
        val client = OkHttpClient.Builder()
            .connectTimeout(connectTimeoutMs, TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .callTimeout(timeoutMs + 10_000L, TimeUnit.MILLISECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        service = retrofit.create(AlbaranDocIntApiService::class.java)
    }

    fun process(
        document: UploadDocument,
        authorizationHeader: String? = null,
    ): ParsedDeliveryNote {
        val body = document.bytes.toRequestBody(document.mimeType.toMediaTypeOrNull())
        val filePart = MultipartBody.Part.createFormData("file", document.fileName, body)

        val response = service.processAlbaran(authorizationHeader, filePart).execute()
        val payload = handleResponse(response)
        if (payload.success != true) {
            throw IllegalStateException("La funciÃ³n DocInt devolviÃ³ success=false")
        }

        return mapToParsedDeliveryNote(payload)
    }

    private fun handleResponse(response: Response<DocIntProxyResponse>): DocIntProxyResponse {
        if (!response.isSuccessful) {
            val detail = runCatching { response.errorBody()?.string().orEmpty() }
                .getOrDefault("")
                .replace(Regex("\\s+"), " ")
                .trim()
                .take(360)
            val detailLower = detail.lowercase()
            if (response.code() == 401) {
                val suffix = if (detail.isNotBlank()) ": $detail" else ""
                throw IllegalStateException("Sesion no valida para escanear con IA$suffix")
            }
            if (
                response.code() == 502 &&
                (
                    detailLower.contains("invalid subscription key") ||
                    detailLower.contains("wrong api endpoint") ||
                    detailLower.contains("docintanalyzefailed: http 401")
                )
            ) {
                throw IllegalStateException(
                    "Credenciales de Azure Document Intelligence invalidas o endpoint incorrecto",
                )
            }
            val isRateLimit = response.code() == 429 ||
                detail.contains("DocIntRateLimited", ignoreCase = true) ||
                detail.contains("\"code\":\"429\"", ignoreCase = true) ||
                detail.contains("HTTP 429", ignoreCase = true)
            if (isRateLimit) {
                val retrySeconds = Regex("retry after\\s+(\\d+)\\s+seconds", RegexOption.IGNORE_CASE)
                    .find(detail)
                    ?.groupValues
                    ?.getOrNull(1)
                val message = if (!retrySeconds.isNullOrBlank()) {
                    "Limite de Azure F0 alcanzado. Espera ${retrySeconds}s y reintenta."
                } else {
                    "Limite de Azure F0 alcanzado. Espera unos segundos y reintenta."
                }
                throw IllegalStateException(message)
            }
            val suffix = if (detail.isNotBlank()) ": $detail" else ""
            throw IllegalStateException("DocInt proxy error HTTP ${response.code()}$suffix")
        }
        return response.body() ?: throw IllegalStateException("DocInt proxy devolvio cuerpo vacio")
    }

    private fun mapToParsedDeliveryNote(payload: DocIntProxyResponse): ParsedDeliveryNote {
        val warnings = linkedSetOf<String>()
        payload.warnings.orEmpty()
            .mapNotNull { it.trim().takeIf(String::isNotBlank) }
            .forEach(warnings::add)

        val supplierValue = payload.supplier?.value.cleanValue()
        val invoiceValue = payload.invoiceNumber?.value.cleanValue()
        val dateValue = normalizeDate(payload.documentDate?.value)
        val supplierConfidence = payload.supplier?.confidence.normalizeConfidence()
        val invoiceConfidence = payload.invoiceNumber?.confidence.normalizeConfidence()
        val dateConfidence = payload.documentDate?.confidence.normalizeConfidence()

        var mappedItems = payload.items.orEmpty().mapNotNull(::mapItem)
        var docType = parseDocType(payload.docType)
        if (docType == ParsedDocType.UNKNOWN && looksLikeServiceItems(mappedItems)) {
            docType = ParsedDocType.SERVICE_MACHINERY
            warnings.add("SERVICE_MARKERS_DETECTED")
        }
        val isServiceDoc = docType == ParsedDocType.SERVICE_MACHINERY

        if (supplierValue == null) warnings.add("AMBIGUOUS_PROVIDER")
        if (!isServiceDoc && invoiceValue == null) warnings.add("MISSING_INVOICE_NUMBER")
        if (!isServiceDoc && dateValue == null) warnings.add("MISSING_DATE")

        val hasPriceColumns = mappedItems.any { it.unitPrice != null || it.costDoc != null }

        if (docType == ParsedDocType.MATERIALS_TABLE && !hasPriceColumns) {
            mappedItems = emptyList()
            warnings.add("NO_PRICE_COLUMNS")
        } else if (docType == ParsedDocType.UNKNOWN && !hasPriceColumns && mappedItems.isNotEmpty()) {
            warnings.add("NO_ECONOMIC_COLUMNS")
        }

        val tableConfidence = payload.items.orEmpty()
            .mapNotNull { it.confidence.normalizeConfidence() }
            .let { values ->
                if (values.isEmpty()) null else values.average()
            }

        val fieldWarnings = ParsedFieldWarnings(
            supplier = buildFieldWarnings(
                value = supplierValue,
                confidence = supplierConfidence,
                missingCode = "AMBIGUOUS_PROVIDER",
            ),
            invoiceNumber = buildFieldWarnings(
                value = invoiceValue,
                confidence = invoiceConfidence,
                missingCode = if (isServiceDoc) null else "MISSING_INVOICE_NUMBER",
            ),
            documentDate = buildFieldWarnings(
                value = dateValue,
                confidence = dateConfidence,
                missingCode = if (isServiceDoc) null else "MISSING_DATE",
            ),
            table = warnings.filter { warning ->
                warning in setOf("NO_PRICE_COLUMNS", "NO_TABLE_STRONG", "LOW_TEXT", "AMBIGUOUS_TABLE")
            },
        )

        val serviceDescription = if (docType == ParsedDocType.SERVICE_MACHINERY) {
            payload.items.orEmpty()
                .mapNotNull { it.description.cleanValue() }
                .firstOrNull()
        } else {
            null
        }

        val score = (
            listOfNotNull(supplierConfidence, invoiceConfidence, dateConfidence, tableConfidence)
                .ifEmpty { listOf(0.45) }
                .average() * 100.0
            ).coerceIn(0.0, 100.0)

        val confidence = confidenceFromPayload(payload, score, warnings)

        return ParsedDeliveryNote(
            supplier = supplierValue,
            supplierNormalized = normalizeSupplierForDedupe(supplierValue),
            invoiceNumber = invoiceValue,
            documentDate = dateValue,
            docType = docType,
            serviceDescription = serviceDescription,
            items = mappedItems,
            confidence = confidence,
            warnings = warnings.toList(),
            rawText = "",
            score = score,
            profileUsed = "ORIGINAL",
            fieldConfidence = ParsedFieldConfidence(
                supplier = supplierConfidence,
                invoiceNumber = invoiceConfidence,
                documentDate = dateConfidence,
                table = tableConfidence,
            ),
            fieldWarnings = fieldWarnings,
            requiresReview = true,
            reviewReason = "Revisa los datos detectados antes de aplicar al albarÃ¡n.",
            headerDetected = supplierValue != null || invoiceValue != null || dateValue != null,
            docSubtype = payload.docSubtype?.trim()?.takeIf { it.isNotBlank() },
            fieldMeta = payload.fieldMeta,
            templateData = payload.templateData,
            source = normalizeSource(payload.source),
            docIntMeta = payload.docIntMeta,
        )
    }

    private fun normalizeSource(source: String?): String {
        val normalized = source?.trim()?.lowercase()
        return if (normalized == "offline") "offline" else "azure"
    }

    private fun mapItem(item: DocIntItemDto): ParsedItem? {
        val description = item.description.cleanValue()
        val reference = item.reference.cleanValue()
        val material = when {
            !description.isNullOrBlank() -> description
            !reference.isNullOrBlank() -> reference
            else -> null
        } ?: return null

        val quantity = item.quantity.normalizeNumber()
        val unitPrice = item.unitPrice.normalizeNumber()
        val lineTotal = item.lineTotal.normalizeNumber()
        val unit = normalizeUnit(item.unit)
        val rowText = listOfNotNull(reference, description).joinToString(" ").trim()

        return ParsedItem(
            material = material,
            quantity = quantity,
            unit = unit,
            unitPrice = unitPrice,
            costDoc = lineTotal,
            rowText = rowText.ifBlank { material },
            missingCritical = material.isBlank() || quantity == null || unit.isNullOrBlank(),
        )
    }

    private fun parseDocType(value: String?): ParsedDocType {
        val normalized = (value ?: "").trim().uppercase()
        return when {
            normalized == "MATERIALS_TABLE" -> ParsedDocType.MATERIALS_TABLE
            normalized == "SERVICE_MACHINERY" -> ParsedDocType.SERVICE_MACHINERY
            normalized.contains("SERVICE") -> ParsedDocType.SERVICE_MACHINERY
            normalized.contains("MATERIAL") -> ParsedDocType.MATERIALS_TABLE
            else -> ParsedDocType.UNKNOWN
        }
    }

    private fun looksLikeServiceItems(items: List<ParsedItem>): Boolean {
        if (items.isEmpty()) return false
        val serviceUnits = items.count { isServiceUnit(it.unit) }
        val serviceDescriptions = items.count { item ->
            val normalized = normalizeText(item.material)
            normalized.contains("HORA") ||
                normalized.contains("VIAJE") ||
                normalized.contains("TON") ||
                normalized.contains("M3") ||
                normalized.contains("SERVICIO") ||
                normalized.contains("JORNADA") ||
                normalized.contains("BOMBA")
        }
        return serviceUnits > 0 || serviceDescriptions >= 2
    }

    private fun isServiceUnit(unit: String?): Boolean {
        val normalized = normalizeText(unit.cleanValue() ?: return false).replace(" ", "")
        return normalized == "H" ||
            normalized == "HORA" ||
            normalized == "HORAS" ||
            normalized == "VIAJE" ||
            normalized == "VIAJES" ||
            normalized == "T" ||
            normalized == "TN" ||
            normalized == "M3" ||
            normalized == "MÂ³"
    }

    private fun confidenceFromPayload(
        payload: DocIntProxyResponse,
        score: Double,
        warnings: Set<String>,
    ): String {
        val explicit = payload.warnings.orEmpty()
        if (warnings.any { it == "LOW_TEXT" || it == "AMBIGUOUS_TABLE" }) return "low"
        if (warnings.any { it == "NO_PRICE_COLUMNS" || it == "AMBIGUOUS_PROVIDER" }) return "medium"
        if (explicit.any { it.equals("LOW_CONFIDENCE", ignoreCase = true) }) return "low"
        return when {
            score >= 80.0 -> "high"
            score >= 60.0 -> "medium"
            else -> "low"
        }
    }

    private fun buildFieldWarnings(
        value: String?,
        confidence: Double?,
        missingCode: String?,
    ): List<String> {
        val out = mutableListOf<String>()
        if (value.isNullOrBlank()) {
            if (!missingCode.isNullOrBlank()) {
                out.add(missingCode)
            }
            return out
        }
        if ((confidence ?: 1.0) < 0.55) {
            out.add("LOW_CONFIDENCE")
        }
        return out
    }

    private fun normalizeDate(raw: String?): String? {
        val value = raw.cleanValue() ?: return null
        val isoRegex = Regex("""\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b""")
        val isoMatch = isoRegex.find(value)
        if (isoMatch != null) {
            val y = isoMatch.groupValues[1].toInt()
            val m = isoMatch.groupValues[2].toInt()
            val d = isoMatch.groupValues[3].toInt()
            return runCatching {
                "%04d-%02d-%02d".format(y, m, d)
            }.getOrNull()
        }

        val esRegex = Regex("""\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](20\d{2}|\d{2})\b""")
        val esMatch = esRegex.find(value) ?: return null
        val day = esMatch.groupValues[1].toInt()
        val month = esMatch.groupValues[2].toInt()
        val yearRaw = esMatch.groupValues[3].toInt()
        val year = if (yearRaw < 100) yearRaw + 2000 else yearRaw
        return "%04d-%02d-%02d".format(year, month, day)
    }

    private fun normalizeUnit(raw: String?): String? {
        val normalized = normalizeText(raw.cleanValue() ?: return null)
            .replace(".", "")
            .replace(" ", "")
        return validUnits[normalized]
    }

    private fun normalizeSupplierForDedupe(supplier: String?): String? {
        val normalized = normalizeText(supplier.cleanValue() ?: return null)
            .replace(Regex("""\bS\.?\s*L\.?\s*U?\.?\b"""), " ")
            .replace(Regex("""\bS\.?\s*A\.?\b"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim()
        return normalized.ifBlank { null }
    }

    private fun normalizeText(value: String): String {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .uppercase()
    }

    private fun String?.cleanValue(): String? {
        val trimmed = this?.trim()
        return if (trimmed.isNullOrBlank()) null else trimmed
    }

    private fun Double?.normalizeNumber(): Double? {
        if (this == null || !this.isFinite()) return null
        return this.coerceAtLeast(0.0)
    }

    private fun Double?.normalizeConfidence(): Double? {
        if (this == null || !this.isFinite()) return null
        return this.coerceIn(0.0, 1.0)
    }
}
