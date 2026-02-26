package com.partesdetrabajo.app

import android.util.Log
import java.text.Normalizer
import kotlin.math.abs
import kotlin.math.roundToInt

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
    val source: String? = null,
    val docIntMeta: Map<String, Any?>? = null,
)

data class OcrToken(
    val text: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val page: Int,
) {
    val centerX: Int
        get() = (left + right) / 2

    val centerY: Int
        get() = (top + bottom) / 2
}

data class OcrLine(
    val text: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val page: Int,
    val tokens: List<OcrToken>,
)

class AlbaranOcrParser(
    private val dictionaries: AlbaranParserDictionaries,
    private val docTypeClassifier: AlbaranDocTypeClassifier? = null,
) {
    private enum class Column {
        MATERIAL,
        CANTIDAD,
        UNIDAD,
        PRECIO,
        COSTE,
    }

    private data class ColumnRange(
        val startX: Int,
        val endX: Int,
    )

    private data class FieldExtract<T>(
        val value: T?,
        val confidence: Double,
        val warnings: List<String>,
    )

    private data class TableRegion(
        val page: Int,
        val left: Float,
        val top: Float,
        val right: Float,
        val bottom: Float,
    )

    private data class TableEvidenceResult(
        val strongTable: Boolean,
        val headerY: Float?,
        val tableRegion: TableRegion?,
        val evidenceScore: Int,
        val reasons: List<String>,
        val headerLine: OcrLine? = null,
        val columnRanges: Map<Column, ColumnRange> = emptyMap(),
        val footerCutoffByPage: Map<Int, Int> = emptyMap(),
    )

    private data class RowCandidate(
        val page: Int,
        val top: Int,
        val bottom: Int,
        val material: String,
        val quantity: Double?,
        val unit: String?,
        val unitPrice: Double?,
        val costDoc: Double?,
        val rowText: String,
        val hasNumeric: Boolean,
        val garbage: Boolean,
    )

    private data class ScoredCandidate(
        val value: String,
        val score: Double,
        val reason: String,
    )

    private val subtotalRegex = Regex("\\b(TOTAL|SUBTOTAL|IVA|BASE|RECARGO|DESCUENTO|RETENCION|RESUMEN)\\b", RegexOption.IGNORE_CASE)
    private val dateRegex = Regex("\\b(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})\\b")
    private val invoiceRegexes = listOf(
        Regex("(?i)\\bALBARAN\\s*(?:NUMERO|NRO|NUM|NO)?\\s*[:#\\-]?\\s*([A-Z0-9\\-\\/.]{3,})"),
        Regex("(?i)\\b(?:NUMERO|NRO|NUM|NO)\\s*(?:DE\\s*)?(?:ALBARAN|PARTE)?\\s*[:#\\-]?\\s*([A-Z0-9\\-\\/.]{3,})"),
    )
    private val monthMap = mapOf(
        "ENERO" to 1,
        "FEBRERO" to 2,
        "MARZO" to 3,
        "ABRIL" to 4,
        "MAYO" to 5,
        "JUNIO" to 6,
        "JULIO" to 7,
        "AGOSTO" to 8,
        "SEPTIEMBRE" to 9,
        "SETIEMBRE" to 9,
        "OCTUBRE" to 10,
        "NOVIEMBRE" to 11,
        "DICIEMBRE" to 12,
    )
    private val tableFooterMarkers = listOf(
        "TOTAL",
        "SUBTOTAL",
        "IVA",
        "BASE IMPONIBLE",
        "OBSERVACIONES",
        "RECARGO",
        "FORMA DE PAGO",
        "CONFORME POR LA OBRA",
        "RECIBI",
        "FIRMADO POR",
    )
    private val dataStopwords = listOf(
        "FECHA",
        "ALBARAN",
        "ALBARANES",
        "PARTE",
        "PARTE DE TRABAJO",
        "CLASE DE TRABAJO",
        "OBSERVACIONES",
        "TOTAL",
        "SUBTOTAL",
        "IVA",
        "BASE IMPONIBLE",
        "BASE",
        "EUROS",
        "IMPORTE",
        "CLIENTE",
        "OBRA",
        "DESTINO",
        "ORIGEN",
        "DOMICILIO",
        "POBLACION",
        "LOCALIDAD",
        "CIF",
        "NIF",
        "DNI",
        "C I F",
        "D N I",
        "TEL",
        "TELEFONO",
        "MOVIL",
        "FAX",
        "EMAIL",
        "CORREO",
        "WEB",
        "WWW",
        "CONFORME",
        "FORMA DE PAGO",
        "COD CTE",
        "CIF CLIENTE",
        "PAGINA",
    )
    private val companyHintMarkers = listOf(
        "SL",
        "S L",
        "SLU",
        "S L U",
        "SA",
        "S A",
        "CB",
        "C B",
        "SCOOP",
        "S COOP",
    )
    private val serviceStrongMarkers = listOf(
        "DESGLOSE JORNADA",
        "HORAS TRABAJO",
        "METROS BOMBEADOS",
        "DESPLAZAMIENTO BOMBA",
        "SERVICIO MINIMO",
        "BOMBA",
        "MATRICULA",
        "OPERADOR",
        "VIAJES",
        "TONELADAS",
        "M3",
        "M 3",
        "M2",
        "M 2",
        "MAQUINA",
        "CLASE DE TRABAJO",
        "OTROS",
        "PARTE DE TRABAJO",
    )
    private val badSupplierTerms = listOf(
        "FECHA",
        "ALBARAN",
        "ALBARANES",
        "PARTE DE TRABAJO",
        "CLASE DE TRABAJO",
        "CLIENTE",
        "OBRA",
        "DESTINO",
        "ORIGEN",
        "TOTAL",
        "OBSERVACIONES",
        "NIF",
        "CIF",
        "DNI",
        "TELEFONO",
        "TEL",
        "FAX",
        "MOVIL",
        "EMAIL",
        "WEB",
        "WWW",
    )
    private val recipientAreaMarkers = listOf(
        "CLIENTE",
        "OBRA",
        "DESTINO",
        "DATOS DE ENVIO",
        "SOLICITADO POR",
        "COD CTE",
        "CIF CLIENTE",
        "DNI CLIENTE",
    )
    private val contactMarkers = listOf(
        "TEL",
        "TELEFONO",
        "MOVIL",
        "FAX",
        "EMAIL",
        "WWW",
        "WEB",
        "C/",
        "CALLE",
        "AVENIDA",
        "AVDA",
        "POLIGONO",
        "P.I.",
        "CP",
        "C.P.",
    )
    private val nonInvoiceContextMarkers = listOf(
        "TEL",
        "TELEFONO",
        "FAX",
        "MOVIL",
        "CP",
        "C.P.",
        "COD CTE",
        "CLIENTE",
    )
    private val invoiceLabelMarkers = listOf(
        "ALBARAN",
        "ALBARAN NUMERO",
        "NUMERO",
        "NRO",
        "REF",
        "DOCUMENTO",
        "NOTA DE ENTREGA",
    )
    private val serviceOnlyMarkers = listOf(
        "DESGLOSE JORNADA",
        "METROS BOMBEADOS",
        "DESPLAZAMIENTO BOMBA",
        "MATRICULA",
        "VIAJES",
        "TONELADAS",
        "PARTE DE TRABAJO",
    )
    private val serviceLayoutHeaderMarkers = listOf(
        "DESGLOSE JORNADA",
        "DESCRIPCION DEL TRABAJO",
        "HORAS TRABAJO",
        "METROS BOMBEADOS",
        "DESPLAZAMIENTO BOMBA",
        "SERVICIO MINIMO",
        "VIAJES",
        "TONELADAS",
        "MATRICULA",
        "OPERADOR",
        "PARTE DE TRABAJO",
    )
    private val strongMaterialHeaderTerms = listOf("ARTICULO", "MATERIAL", "CONCEPTO")

    private val strictDescriptionSynonyms by lazy {
        strictColumnSynonyms(
            source = dictionaries.normalizedColumnSynonyms("descripcion"),
            blocked = listOf("DESCRIPCION DEL TRABAJO", "TRABAJO", "OTROS", "DESGLOSE JORNADA"),
            fallback = listOf("MATERIAL", "CONCEPTO", "DESCRIPCION", "ARTICULO", "PRODUCTO", "DESCR"),
        )
    }

    private val strictQuantitySynonyms by lazy {
        strictColumnSynonyms(
            source = dictionaries.normalizedColumnSynonyms("cantidad"),
            blocked = listOf("HORAS", "HORAS TRABAJO", "M3", "M2", "TONELADAS", "VIAJES"),
            fallback = listOf("CANTIDAD", "CANT", "QTY", "UNIDADES"),
        )
    }

    private val strictPriceSynonyms by lazy {
        strictColumnSynonyms(
            source = dictionaries.normalizedColumnSynonyms("precio"),
            blocked = listOf("PRECIO HORA"),
            fallback = listOf("PRECIO", "PRECIO UD", "P U", "EUR UD", "UNIT PRICE"),
        )
    }

    private val strictAmountSynonyms by lazy {
        strictColumnSynonyms(
            source = dictionaries.normalizedColumnSynonyms("importe"),
            blocked = emptyList(),
            fallback = listOf("COSTE", "IMPORTE", "TOTAL", "IMPORTE LINEA"),
        )
    }

    fun parse(
        lines: List<OcrLine>,
        tokens: List<OcrToken>,
        pageWidth: Int,
        profileUsed: String,
        ocrScore: Double,
        ocrConfidence: String,
        ocrWarnings: List<String>,
        rawText: String = "",
        rowTolerancePx: Int = 18,
    ): ParsedDeliveryNote {
        if (lines.isEmpty()) {
            return ParsedDeliveryNote(
                supplier = null,
                supplierNormalized = null,
                invoiceNumber = null,
                documentDate = null,
                docType = ParsedDocType.UNKNOWN,
                serviceDescription = null,
                items = emptyList(),
                confidence = "low",
                warnings = listOf("LOW_TEXT"),
                rawText = rawText,
                score = 0.0,
                profileUsed = profileUsed,
                fieldConfidence = ParsedFieldConfidence(),
                fieldWarnings = ParsedFieldWarnings(table = listOf("LOW_TEXT")),
                requiresReview = true,
                reviewReason = "No se detecto texto en el albaran",
                headerDetected = false,
            )
        }

        val orderedLines = lines.sortedWith(compareBy<OcrLine> { it.page }.thenBy { it.top })
        val normalizedText = orderedLines.joinToString(" ") { normalizeText(it.text) }

        val supplier = extractSupplier(orderedLines)
        val supplierNormalized = normalizeSupplierForDedupe(supplier.value)
        val invoice = extractInvoiceNumber(orderedLines, pageWidth)
        val documentDate = extractDocumentDate(orderedLines)

        val hasTokenBBoxes = tokens.isNotEmpty()
        val tableEvidence = if (hasTokenBBoxes) {
            isStrongMaterialsTable(
                lines = orderedLines,
                tokens = tokens,
                pageWidth = pageWidth,
                rowTolerancePx = rowTolerancePx,
            )
        } else {
            TableEvidenceResult(
                strongTable = false,
                headerY = null,
                tableRegion = null,
                evidenceScore = 0,
                reasons = listOf("NO_TOKEN_BBOX", "NO_HEADER"),
            )
        }

        val parsedItems = if (tableEvidence.strongTable) {
            parseRowsFromStrongTable(
                evidence = tableEvidence,
                allTokens = tokens,
                rowTolerancePx = rowTolerancePx,
            )
        } else {
            emptyList()
        }.filter { !subtotalRegex.containsMatchIn(normalizeText(it.rowText)) }

        val serviceDictionaryHits = countMarkerHits(normalizedText, dictionaries.normalizedDocMarkers("SERVICE_MACHINERY"))
        val serviceStrongHits = countExplicitHits(normalizedText, serviceStrongMarkers)
        val serviceOnlyHits = countExplicitHits(normalizedText, serviceOnlyMarkers)
        val serviceMarkerHits = serviceDictionaryHits + serviceStrongHits
        val materialMarkerHits = countMarkerHits(normalizedText, dictionaries.normalizedDocMarkers("MATERIALS"))
        val priceMarkerHits = countMarkerHits(normalizedText, dictionaries.normalizedColumnSynonyms("precio"))
        val amountMarkerHits = countMarkerHits(normalizedText, dictionaries.normalizedColumnSynonyms("importe"))
        val economicSummaryHits = countExplicitHits(
            haystackNormalized = normalizedText,
            terms = listOf("SUBTOTAL", "BASE IMPONIBLE", "TOTAL", "EUROS", "IMPORTE"),
        )

        val materialLikeRows = parsedItems.count {
            it.material.isNotBlank() && it.material.length >= 3 && (it.quantity != null || it.unitPrice != null || it.costDoc != null)
        }
        val strongServiceEvidence = !tableEvidence.strongTable &&
            (
                serviceOnlyHits >= 1 ||
                    serviceMarkerHits >= 3 ||
                    (serviceMarkerHits >= 2 && materialMarkerHits <= 2)
                )

        val heuristicDocType = when {
            tableEvidence.strongTable -> ParsedDocType.MATERIALS_TABLE
            strongServiceEvidence -> ParsedDocType.SERVICE_MACHINERY
            else -> ParsedDocType.UNKNOWN
        }
        val docTypeModelPrediction = if (!tableEvidence.strongTable) {
            docTypeClassifier?.predict(normalizedText)
        } else {
            null
        }
        if (docTypeModelPrediction != null) {
            val ranked = docTypeModelPrediction.rankedLabels
                .joinToString(" | ") { (label, score) -> "$label=${"%.2f".format(score)}" }
            logInfo(
                "docTypeModel predicted=${docTypeModelPrediction.docType.name} " +
                    "confidence=${"%.2f".format(docTypeModelPrediction.confidence)} ranked=$ranked",
            )
        }

        val docType = when {
            heuristicDocType == ParsedDocType.MATERIALS_TABLE -> ParsedDocType.MATERIALS_TABLE
            heuristicDocType == ParsedDocType.SERVICE_MACHINERY -> ParsedDocType.SERVICE_MACHINERY
            docTypeModelPrediction?.docType == ParsedDocType.SERVICE_MACHINERY &&
                docTypeModelPrediction.confidence >= 0.76 -> ParsedDocType.SERVICE_MACHINERY
            else -> ParsedDocType.UNKNOWN
        }
        val modelAdjustedDocType = docType != heuristicDocType

        val rowEconomicHits = parsedItems.count { it.unitPrice != null || it.costDoc != null }
        val hasEconomicEvidence = tableEvidence.strongTable &&
            materialLikeRows > 0 &&
            (rowEconomicHits >= 1 || priceMarkerHits + amountMarkerHits >= 1 || economicSummaryHits >= 2)
        val noPriceColumns = tableEvidence.strongTable && materialLikeRows > 0 && !hasEconomicEvidence

        val serviceDescription = when {
            docType == ParsedDocType.SERVICE_MACHINERY -> extractServiceDescription(orderedLines)
            noPriceColumns -> extractNoPriceDescription(parsedItems, orderedLines)
            else -> null
        }
        val suppressAutoItems = tableEvidence.strongTable &&
            (
                ocrConfidence == "low" ||
                    ocrScore < 45.0 ||
                    tableEvidence.evidenceScore < 55 ||
                    parsedItems.size < 2
                )
        val strongRowsForAutofill = parsedItems.count { item ->
            val material = item.material.trim()
            val normalizedMaterial = normalizeText(material)
            val looksMaterial = material.length >= 4 &&
                material.any { ch -> ch.isLetter() } &&
                !isLikelyAddress(normalizedMaterial)
            val hasStructuredQuantity = item.quantity != null && (item.unit != null || item.unitPrice != null || item.costDoc != null)
            looksMaterial && hasStructuredQuantity
        }
        val strictAutoFillAllowed = tableEvidence.strongTable &&
            tableEvidence.evidenceScore >= 68 &&
            ocrScore >= 52.0 &&
            ocrConfidence != "low" &&
            hasEconomicEvidence &&
            strongRowsForAutofill >= 2

        val finalItems = if (
            docType == ParsedDocType.MATERIALS_TABLE &&
            !noPriceColumns &&
            !suppressAutoItems &&
            strictAutoFillAllowed
        ) {
            parsedItems
        } else {
            emptyList()
        }

        val warnings = linkedSetOf<String>()
        warnings.addAll(ocrWarnings)
        if (!hasTokenBBoxes) warnings.add("NO_TOKEN_BBOX")
        if (!tableEvidence.strongTable) {
            warnings.add("NO_TABLE_STRONG")
            warnings.addAll(tableEvidence.reasons)
        }
        warnings.addAll(supplier.warnings)
        warnings.addAll(invoice.warnings)
        warnings.addAll(documentDate.warnings)
        if (modelAdjustedDocType) warnings.add("DOC_TYPE_MODEL_OVERRIDE")
        if (docType == ParsedDocType.SERVICE_MACHINERY) warnings.add("NO_TABLE")
        if (docType == ParsedDocType.UNKNOWN) warnings.add("NO_TABLE")
        if (noPriceColumns) warnings.add("NO_PRICE_COLUMNS")
        if (suppressAutoItems) warnings.add("AMBIGUOUS_TABLE")
        if (!strictAutoFillAllowed && parsedItems.isNotEmpty()) warnings.add("AUTO_ITEMS_SUPPRESSED")

        val headerBonus = if (tableEvidence.headerY != null) 8.0 else 0.0
        val tableEvidenceBonus = (tableEvidence.evidenceScore / 6.0).coerceAtMost(12.0)
        val itemBonus = (finalItems.size * 2.0).coerceAtMost(12.0)
        val warningPenalty = buildList {
            if (warnings.contains("HANDWRITING_LOW_CONFIDENCE")) add(4.0)
            if (warnings.contains("DECIMAL_AMBIGUITY")) add(2.0)
            if (warnings.contains("LOW_CONTRAST")) add(2.0)
            if (warnings.contains("NO_TABLE_STRONG")) add(4.0)
        }.sum()
        val finalScore = (ocrScore + headerBonus + tableEvidenceBonus + itemBonus - warningPenalty).coerceIn(0.0, 100.0)
        val confidence = inferConfidence(
            ocrConfidence = ocrConfidence,
            score = finalScore,
            warnings = warnings,
            docType = docType,
            hasItems = finalItems.isNotEmpty(),
            noPriceColumns = noPriceColumns,
        )
        val missingMaterials = tableEvidence.strongTable && finalItems.isEmpty() && !noPriceColumns
        val reviewRiskWarnings = setOf("LOW_TEXT", "BLUR", "GLARE", "HANDWRITING_LOW_CONFIDENCE", "NO_TABLE_STRONG", "AMBIGUOUS_TABLE")
        val requiresReview = confidence == "low" || warnings.any { it in reviewRiskWarnings } || docType == ParsedDocType.UNKNOWN || missingMaterials
        val reviewReason = when {
            !tableEvidence.strongTable ->
                "No se detecto una tabla de materiales con fiabilidad. Puedes anadir filas manualmente o cancelar."
            noPriceColumns -> "El albaran no incluye precios/importes para imputacion economica."
            docType == ParsedDocType.UNKNOWN -> "No se pudo clasificar el documento con suficiente fiabilidad."
            docType == ParsedDocType.MATERIALS_TABLE && finalItems.isEmpty() -> "No se pudieron extraer lineas de materiales."
            confidence == "low" -> "La lectura OCR es baja. Revisa campos antes de aplicar."
            else -> null
        }

        logInfo(
                "parseResult profile=$profileUsed ocrScore=$ocrScore ocrConfidence=$ocrConfidence " +
                "tableStrong=${tableEvidence.strongTable} tableEvidence=${tableEvidence.evidenceScore} " +
                "serviceHits=$serviceMarkerHits serviceOnlyHits=$serviceOnlyHits materialHits=$materialMarkerHits " +
                "docType=${docType.name} heuristicDocType=${heuristicDocType.name} " +
                "docTypeModel=${docTypeModelPrediction?.docType?.name ?: "-"} " +
                "docTypeModelScore=${docTypeModelPrediction?.confidence?.times(100)?.roundToInt() ?: 0} " +
                "supplier=${supplier.value ?: "-"} supplierNormalized=${supplierNormalized ?: "-"} " +
                "invoice=${invoice.value ?: "-"} date=${documentDate.value ?: "-"} " +
                "parsedItems=${parsedItems.size} finalItems=${finalItems.size} warnings=${warnings.joinToString(",")}",
        )

        return ParsedDeliveryNote(
            supplier = supplier.value,
            supplierNormalized = supplierNormalized,
            invoiceNumber = invoice.value,
            documentDate = documentDate.value,
            docType = docType,
            serviceDescription = serviceDescription,
            items = finalItems,
            confidence = confidence,
            warnings = warnings.toList(),
            rawText = rawText,
            score = finalScore,
            profileUsed = profileUsed,
            fieldConfidence = ParsedFieldConfidence(
                supplier = supplier.confidence.takeIf { it > 0.0 },
                invoiceNumber = invoice.confidence.takeIf { it > 0.0 },
                documentDate = documentDate.confidence.takeIf { it > 0.0 },
                table = when (docType) {
                    ParsedDocType.MATERIALS_TABLE -> if (noPriceColumns) 0.55 else (0.55 + (tableEvidence.evidenceScore.toDouble() / 200.0)).coerceAtMost(0.95)
                    ParsedDocType.SERVICE_MACHINERY -> 0.3
                    ParsedDocType.UNKNOWN -> 0.0
                },
            ),
            fieldWarnings = ParsedFieldWarnings(
                supplier = supplier.warnings,
                invoiceNumber = invoice.warnings,
                documentDate = documentDate.warnings,
                table = buildList {
                    if (!tableEvidence.strongTable) add("NO_TABLE_STRONG")
                    addAll(tableEvidence.reasons)
                    if (docType != ParsedDocType.MATERIALS_TABLE) add("NO_TABLE")
                    if (noPriceColumns) add("NO_PRICE_COLUMNS")
                }.distinct(),
            ),
            requiresReview = requiresReview,
            reviewReason = reviewReason,
            headerDetected = tableEvidence.headerY != null,
        )
    }

    private fun extractSupplier(lines: List<OcrLine>): FieldExtract<String> {
        val firstPageLines = lines.filter { it.page == 0 }
        if (firstPageLines.isEmpty()) return FieldExtract(null, 0.0, listOf("AMBIGUOUS_PROVIDER"))

        val supplierLabels = dictionaries.normalizedFieldSynonyms("proveedor")
        val topLines = topPageAreaLines(firstPageLines, ratio = 0.25f)
        val footerLines = bottomPageAreaLines(firstPageLines, ratio = 0.35f)
        val candidates = mutableListOf<ScoredCandidate>()

        fun collect(
            source: List<OcrLine>,
            zone: String,
        ) {
            source.forEachIndexed { index, line ->
                val normalizedLine = normalizeText(line.text)
                val context = buildContextWindow(source, index)
                if (containsAny(normalizedLine, supplierLabels)) {
                    val inlineValue = stripKnownLabelPrefix(line.text)
                    addSupplierCandidate(candidates, inlineValue, context, "$zone:label")
                    val rightValue = source.firstOrNull {
                        it.page == line.page && abs(it.top - line.top) <= 14 && it.left > line.right
                    }?.text?.trim()
                    addSupplierCandidate(candidates, rightValue, context, "$zone:right")
                }

                if (containsAnyTerm(normalizedLine, companyHintMarkers) || containsAnyTerm(normalizedLine, contactMarkers)) {
                    addSupplierCandidate(candidates, line.text, context, "$zone:company")
                }
            }
        }

        collect(topLines, "top")
        collect(footerLines, "footer")

        val ranked = candidates
            .groupBy { normalizeText(it.value) }
            .mapNotNull { (_, entries) -> entries.maxByOrNull { entry -> entry.score } }
            .sortedByDescending { it.score }

        if (ranked.isNotEmpty()) {
            logDebug(
                "supplierCandidates top=${ranked.take(5).joinToString(" | ") { "${it.value} (${it.score}) ${it.reason}" }}",
            )
        }

        val selected = ranked.firstOrNull()
        if (selected != null) {
            val confidence = when {
                selected.score >= 6.2 -> 0.92
                selected.score >= 4.8 -> 0.82
                selected.score >= 3.6 -> 0.72
                else -> 0.58
            }
            val warnings = if (confidence < 0.75) listOf("AMBIGUOUS_PROVIDER") else emptyList()
            return FieldExtract(cleanSupplierName(selected.value), confidence, warnings)
        }

        return FieldExtract(null, 0.0, listOf("AMBIGUOUS_PROVIDER"))
    }

    private fun extractInvoiceNumber(lines: List<OcrLine>, pageWidth: Int): FieldExtract<String> {
        val invoiceLabels = (dictionaries.normalizedFieldSynonyms("numeroDocumento") + invoiceLabelMarkers.map { normalizeText(it) }).distinct()
        val firstPageLines = lines.filter { it.page == 0 }
        val topLines = topPageAreaLines(firstPageLines, ratio = 0.35f)
        val hasAnyInvoiceLabel = lines.any { line ->
            val normalized = normalizeText(line.text)
            containsAny(normalized, invoiceLabels) || normalized.contains("ALBARAN")
        }
        val candidates = mutableListOf<ScoredCandidate>()
        var lowConfidence = false

        fun addCandidate(
            rawValue: String?,
            contextNormalized: String,
            score: Double,
            reason: String,
        ) {
            val value = rawValue?.trim()?.trimEnd('.', '-', ':').orEmpty()
            if (value.isBlank()) return
            if (!isValidInvoiceNumber(value)) {
                lowConfidence = true
                return
            }
            val normalizedValue = normalizeText(value)
            if (isInvoiceBlockedByContext(normalizedValue, contextNormalized)) {
                logDebug("invoiceRejected value=$value reason=context context=$contextNormalized")
                return
            }
            candidates.add(
                ScoredCandidate(
                    value = value,
                    score = score + invoiceShapeScore(normalizedValue),
                    reason = reason,
                ),
            )
        }

        lines.forEach { line ->
            val text = line.text.trim()
            if (text.isEmpty()) return@forEach
            val normalized = normalizeText(text)
            val hasInvoiceLabel = containsAny(normalized, invoiceLabels) || normalized.contains("ALBARAN")

            if (hasInvoiceLabel) {
                invoiceRegexes.forEach { regex ->
                    val value = regex.find(normalized)?.groupValues?.getOrNull(1)
                    addCandidate(value, normalized, 4.6, "label-regex")
                }

                val labelInline = extractInvoiceInlineValue(normalized)
                addCandidate(labelInline, normalized, 4.1, "label-inline")

                val rightCandidate = lines.firstOrNull {
                    it.page == line.page && abs(it.top - line.top) <= 12 && it.left > line.right
                }?.text?.trim()
                addCandidate(rightCandidate, normalized, 3.5, "right-neighbor")

                val lowerCandidate = lines.firstOrNull {
                    it.page == line.page &&
                        it.top > line.bottom &&
                        it.top - line.bottom <= 28 &&
                        abs(it.left - line.left) <= 80
                }?.text?.trim()
                addCandidate(lowerCandidate, normalized, 3.2, "below-neighbor")
            }

            val isTopRight = hasAnyInvoiceLabel &&
                line.page == 0 &&
                line.left >= (pageWidth * 0.55).toInt() &&
                topLines.any { topLine -> topLine === line }
            if (isTopRight) {
                plausibleInvoiceTokens(normalized).forEach { token ->
                    addCandidate(token, normalized, 2.6, "top-right")
                }
            }
        }

        val ranked = candidates
            .groupBy { normalizeText(it.value) }
            .mapNotNull { (_, values) -> values.maxByOrNull { it.score } }
            .sortedByDescending { it.score }

        if (ranked.isNotEmpty()) {
            logDebug(
                "invoiceCandidates top=${ranked.take(6).joinToString(" | ") { "${it.value} (${it.score}) ${it.reason}" }}",
            )
        }

        val selected = ranked.firstOrNull()
        if (selected != null) {
            val confidence = when {
                selected.score >= 6.0 -> 0.95
                selected.score >= 4.7 -> 0.85
                selected.score >= 3.4 -> 0.74
                else -> 0.6
            }
            val warnings = if (confidence < 0.72) listOf("HANDWRITING_LOW_CONFIDENCE") else emptyList()
            return FieldExtract(selected.value, confidence, warnings)
        }

        val warnings = mutableListOf<String>()
        if (lowConfidence) warnings.add("HANDWRITING_LOW_CONFIDENCE")
        warnings.add("MISSING_INVOICE_NUMBER")
        return FieldExtract(null, 0.0, warnings)
    }

    private fun extractDocumentDate(lines: List<OcrLine>): FieldExtract<String> {
        val dateLabels = dictionaries.normalizedFieldSynonyms("fecha")
        val firstPageLines = lines.filter { it.page == 0 }
        val dateAreaLines = topPageAreaLines(firstPageLines, ratio = 0.4f)
        val candidates = mutableListOf<ScoredCandidate>()

        fun addCandidate(rawValue: String?, score: Double, reason: String) {
            val iso = extractDateFromText(rawValue) ?: return
            candidates.add(ScoredCandidate(iso, score, reason))
        }

        for (line in dateAreaLines) {
            val normalized = normalizeText(line.text)
            if (!containsAny(normalized, dateLabels)) continue
            val raw = line.text.substringAfter(':', "").trim()
            addCandidate(raw, 0.85, "label-inline")

            val right = dateAreaLines.firstOrNull {
                it.page == line.page && abs(it.top - line.top) <= 12 && it.left > line.right
            }?.text?.trim()
            addCandidate(right, 0.8, "label-right")

            val below = dateAreaLines.firstOrNull {
                it.page == line.page &&
                    it.top > line.bottom &&
                    it.top - line.bottom <= 28 &&
                    abs(it.left - line.left) <= 60
            }?.text?.trim()
            addCandidate(below, 0.74, "label-below")
        }

        val maxRight = dateAreaLines.maxOfOrNull { line -> line.right } ?: 0
        dateAreaLines
            .filter { line -> line.left >= (maxRight * 0.35f).toInt() }
            .forEach { line ->
                addCandidate(line.text, 0.62, "top-fallback")
            }

        val selected = candidates.maxByOrNull { it.score }
        if (selected != null) {
            logDebug("dateSelected value=${selected.value} reason=${selected.reason} score=${selected.score}")
            return FieldExtract(selected.value, selected.score.coerceAtMost(0.9), emptyList())
        }

        return FieldExtract(null, 0.0, listOf("MISSING_DATE"))
    }

    private fun extractInvoiceInlineValue(normalizedLine: String): String? {
        val regex = Regex("\\b(?:ALBARAN|NUMERO|NRO|REF|DOCUMENTO)\\b\\s*[:#\\-]?\\s*([A-Z0-9\\-\\/.]{3,})")
        return regex.find(normalizedLine)?.groupValues?.getOrNull(1)
    }

    private fun plausibleInvoiceTokens(normalizedLine: String): List<String> {
        val pattern = Regex("\\b(?:[A-Z]{0,4}[-/]?)?\\d{4,12}(?:[-/][A-Z0-9]{1,8})?\\b")
        return pattern.findAll(normalizedLine)
            .map { it.value.trim() }
            .filter { token -> token.length >= 4 }
            .toList()
    }

    private fun isInvoiceBlockedByContext(normalizedInvoice: String, contextNormalized: String): Boolean {
        val digitsOnly = normalizedInvoice.filter { it.isDigit() }
        if (isLikelyAddress(contextNormalized)) {
            return true
        }
        if (digitsOnly.length in 8..13 && containsAnyTerm(contextNormalized, listOf("TEL", "TELEFONO", "MOVIL", "FAX"))) {
            return true
        }
        if (digitsOnly.length == 5 && containsAnyTerm(contextNormalized, listOf("CP", "C.P.", "POBLACION", "LOCALIDAD"))) {
            return true
        }
        if (digitsOnly.length == 5 && isLikelyAddress(contextNormalized)) {
            return true
        }
        if (digitsOnly.length >= 8 && containsAnyTerm(contextNormalized, nonInvoiceContextMarkers)) {
            return true
        }
        return false
    }

    private fun invoiceShapeScore(normalizedInvoice: String): Double {
        val digits = normalizedInvoice.count { it.isDigit() }
        val letters = normalizedInvoice.count { it.isLetter() }
        var score = 0.0
        if (digits in 4..10) score += 1.4
        if (letters in 1..4) score += 0.5
        if (normalizedInvoice.contains("-") || normalizedInvoice.contains("/")) score += 0.4
        return score
    }

    private fun extractServiceDescription(lines: List<OcrLine>): String? {
        val keys = listOf("DESCRIPCION DEL TRABAJO", "OTROS", "CONCEPTO", "TRABAJO")
        for ((index, line) in lines.withIndex()) {
            val normalized = normalizeText(line.text)
            if (!keys.any { normalized.contains(it) }) continue

            val trailing = line.text.substringAfter(':', "").trim()
            if (trailing.length > 4) return trailing

            val right = lines.firstOrNull {
                it.page == line.page && abs(it.top - line.top) <= 12 && it.left > line.right
            }?.text?.trim()
            if (!right.isNullOrBlank() && right.length > 4) return right

            val next = lines.getOrNull(index + 1)?.text?.trim()
            if (!next.isNullOrBlank() && next.length > 4) return next
        }

        return lines
            .map { it.text.trim() }
            .filter { it.length > 12 && it.any { ch -> ch.isLetter() } && !subtotalRegex.containsMatchIn(normalizeText(it)) }
            .maxByOrNull { it.length }
    }

    private fun extractNoPriceDescription(parsedItems: List<ParsedItem>, lines: List<OcrLine>): String? {
        val firstMaterial = parsedItems
            .map { it.material.trim() }
            .firstOrNull { it.length >= 3 }
        if (!firstMaterial.isNullOrBlank()) return firstMaterial
        return extractServiceDescription(lines)
    }

    private fun findHeaderLine(lines: List<OcrLine>): OcrLine? {
        var best: OcrLine? = null
        var bestScore = 0
        for (line in lines) {
            val score = scoreHeaderLine(line.text)
            if (score > bestScore) {
                bestScore = score
                best = line
            }
        }
        return if (bestScore >= 3) best else null
    }

    private fun scoreHeaderLine(text: String): Int {
        val normalized = normalizeText(text)
        var score = 0
        if (containsAny(normalized, strictDescriptionSynonyms)) score += 1
        if (containsAny(normalized, strictQuantitySynonyms)) score += 1
        if (containsAny(normalized, dictionaries.normalizedColumnSynonyms("unidad"))) score += 1
        if (containsAny(normalized, strictPriceSynonyms)) score += 1
        if (containsAny(normalized, strictAmountSynonyms)) score += 1
        return score
    }

    private fun isStrongMaterialsTable(
        lines: List<OcrLine>,
        tokens: List<OcrToken>,
        pageWidth: Int,
        rowTolerancePx: Int,
    ): TableEvidenceResult {
        if (tokens.isEmpty() || lines.isEmpty()) {
            return TableEvidenceResult(
                strongTable = false,
                headerY = null,
                tableRegion = null,
                evidenceScore = 0,
                reasons = listOf("NO_TOKEN_BBOX", "NO_HEADER"),
            )
        }

        val headerCandidate = lines
            .mapNotNull { line ->
                val normalized = normalizeText(line.text)
                val hasDesc = containsAny(normalized, strictDescriptionSynonyms)
                val hasQty = containsAny(normalized, strictQuantitySynonyms)
                val hasPrice = containsAny(normalized, strictPriceSynonyms)
                val hasAmount = containsAny(normalized, strictAmountSynonyms)
                val categories = listOf(hasDesc, hasQty, hasPrice, hasAmount).count { it }
                if (!hasDesc || !hasQty || (!hasPrice && !hasAmount)) {
                    return@mapNotNull null
                }
                Pair(line, categories)
            }
            .maxWithOrNull(
                compareBy<Pair<OcrLine, Int>> { it.second }
                    .thenBy { it.first.tokens.size }
                    .thenByDescending { it.first.right - it.first.left },
            )

        if (headerCandidate == null) {
            return TableEvidenceResult(
                strongTable = false,
                headerY = null,
                tableRegion = null,
                evidenceScore = 0,
                reasons = listOf("NO_HEADER"),
            )
        }

        val headerLine = headerCandidate.first
        val headerScore = headerCandidate.second
        val headerNormalized = normalizeText(headerLine.text)
        val serviceHeaderHits = countExplicitHits(headerNormalized, serviceLayoutHeaderMarkers)
        val hasStrongMaterialHeader = containsAnyTerm(headerNormalized, strongMaterialHeaderTerms)
        if (serviceHeaderHits >= 1 && !hasStrongMaterialHeader) {
            return TableEvidenceResult(
                strongTable = false,
                headerY = ((headerLine.top + headerLine.bottom) / 2f),
                tableRegion = null,
                evidenceScore = (headerScore * 12).coerceIn(0, 100),
                reasons = listOf("SERVICE_LAYOUT_HEADER"),
                headerLine = headerLine,
            )
        }
        val footerCutoffByPage = buildFooterCutoffByPage(lines, headerLine.page, headerLine.bottom)
        val columnRanges = buildColumnRanges(detectColumnAnchors(headerLine), pageWidth)

        val scopedTokens = tokens
            .filter { token -> token.page >= headerLine.page }
            .filter { token ->
                if (token.page == headerLine.page && token.top <= headerLine.bottom + 2) {
                    return@filter false
                }
                val footerCutoff = footerCutoffByPage[token.page] ?: Int.MAX_VALUE
                token.top < footerCutoff
            }
            .sortedWith(compareBy<OcrToken> { it.page }.thenBy { it.centerY }.thenBy { it.left })

        if (scopedTokens.isEmpty()) {
            return TableEvidenceResult(
                strongTable = false,
                headerY = ((headerLine.top + headerLine.bottom) / 2f),
                tableRegion = null,
                evidenceScore = (headerScore * 15).coerceIn(0, 100),
                reasons = listOf("FOOTER_ONLY"),
                headerLine = headerLine,
                columnRanges = columnRanges,
                footerCutoffByPage = footerCutoffByPage,
            )
        }

        val rowGroups = groupTokensByRow(scopedTokens, rowTolerancePx)
        val rowCandidates = rowGroups.map { row ->
            buildRowCandidate(row, columnRanges)
        }

        val dataRows = rowCandidates.count { row ->
            !row.garbage && row.material.isNotBlank() && row.material.any { ch -> ch.isLetter() } && row.hasNumeric
        }

        val reasons = mutableListOf<String>()
        if (dataRows == 0) reasons.add("NO_NUMERIC_QTY")
        if (dataRows == 1) reasons.add("ONLY_ONE_DATA_ROW")
        if (rowCandidates.isNotEmpty() && rowCandidates.all { it.garbage }) reasons.add("FOOTER_ONLY")

        val tableTop = (headerLine.bottom + 2).toFloat()
        val tableBottom = scopedTokens.maxOfOrNull { it.bottom }?.toFloat()
        val tableRegion = if (tableBottom != null && tableBottom > tableTop) {
            TableRegion(
                page = headerLine.page,
                left = 0f,
                top = tableTop,
                right = pageWidth.toFloat(),
                bottom = tableBottom,
            )
        } else {
            null
        }

        val evidenceScore = (
            (headerScore * 18) +
                (dataRows * 20).coerceAtMost(40) +
                (rowCandidates.count { it.hasNumeric } * 6).coerceAtMost(20)
            ).coerceIn(0, 100)

        return TableEvidenceResult(
            strongTable = dataRows >= 2 && tableRegion != null,
            headerY = ((headerLine.top + headerLine.bottom) / 2f),
            tableRegion = tableRegion,
            evidenceScore = evidenceScore,
            reasons = reasons.distinct(),
            headerLine = headerLine,
            columnRanges = columnRanges,
            footerCutoffByPage = footerCutoffByPage,
        )
    }

    private fun parseRowsFromStrongTable(
        evidence: TableEvidenceResult,
        allTokens: List<OcrToken>,
        rowTolerancePx: Int,
    ): List<ParsedItem> {
        val headerLine = evidence.headerLine ?: return emptyList()
        val ranges = evidence.columnRanges
        if (ranges.isEmpty()) return emptyList()

        val scopedTokens = allTokens
            .filter { token -> token.page >= headerLine.page }
            .filter { token ->
                if (token.page == headerLine.page && token.top <= headerLine.bottom + 2) {
                    return@filter false
                }
                val footerCutoff = evidence.footerCutoffByPage[token.page] ?: Int.MAX_VALUE
                token.top < footerCutoff
            }
            .sortedWith(compareBy<OcrToken> { it.page }.thenBy { it.centerY }.thenBy { it.left })

        val rowCandidates = groupTokensByRow(scopedTokens, rowTolerancePx)
            .map { row -> buildRowCandidate(row, ranges) }
            .sortedWith(compareBy<RowCandidate> { it.page }.thenBy { it.top })

        val mergedRows = mutableListOf<RowCandidate>()
        for (candidate in rowCandidates) {
            if (candidate.garbage) continue
            if (!candidate.hasNumeric && candidate.material.isNotBlank() && mergedRows.isNotEmpty()) {
                val previous = mergedRows.last()
                val samePage = previous.page == candidate.page
                val nearPrevious = candidate.top - previous.bottom <= (rowTolerancePx * 2)
                if (samePage && nearPrevious) {
                    mergedRows[mergedRows.lastIndex] = previous.copy(
                        material = "${previous.material} ${candidate.material}".trim(),
                        rowText = "${previous.rowText} ${candidate.rowText}".trim(),
                        bottom = candidate.bottom,
                    )
                    continue
                }
            }
            mergedRows.add(candidate)
        }

        return mergedRows
            .filter { row -> row.hasNumeric && !row.garbage && row.material.length >= 2 }
            .map { row ->
                ParsedItem(
                    material = row.material,
                    quantity = row.quantity,
                    unit = row.unit,
                    unitPrice = row.unitPrice,
                    costDoc = row.costDoc,
                    rowText = row.rowText,
                    missingCritical = row.material.isBlank() || row.quantity == null || row.unit == null,
                )
            }
    }

    private fun buildRowCandidate(
        rowTokens: List<OcrToken>,
        ranges: Map<Column, ColumnRange>,
    ): RowCandidate {
        val sortedTokens = rowTokens.sortedBy { token -> token.left }
        val rowText = sortedTokens.joinToString(" ") { token -> token.text.trim() }.trim()
        val materialRaw = textForColumn(sortedTokens, ranges[Column.MATERIAL]).ifBlank { fallbackMaterial(sortedTokens) }.trim()
        val quantityRaw = textForColumn(sortedTokens, ranges[Column.CANTIDAD])
        val unitRaw = textForColumn(sortedTokens, ranges[Column.UNIDAD])
        val quantityUnitSource = listOf(quantityRaw, unitRaw).filter { value -> value.isNotBlank() }.joinToString(" ").trim()
        val unitFromQty = parseQuantityAndUnit(quantityUnitSource)
        val quantity = unitFromQty.first ?: parseDecimalEs(quantityRaw)
        val unit = normalizeUnit(unitRaw.ifBlank { unitFromQty.second ?: detectUnitToken(sortedTokens) })
        val unitPrice = parseDecimalEs(textForColumn(sortedTokens, ranges[Column.PRECIO]))
        val costDoc = parseDecimalEs(textForColumn(sortedTokens, ranges[Column.COSTE]))

        val hasNumeric = quantity != null || unitPrice != null || costDoc != null
        val garbage = isGarbageRowDescription(materialRaw.ifBlank { rowText })

        return RowCandidate(
            page = sortedTokens.firstOrNull()?.page ?: 0,
            top = sortedTokens.minOfOrNull { token -> token.top } ?: 0,
            bottom = sortedTokens.maxOfOrNull { token -> token.bottom } ?: 0,
            material = materialRaw,
            quantity = quantity,
            unit = unit,
            unitPrice = unitPrice,
            costDoc = costDoc,
            rowText = rowText,
            hasNumeric = hasNumeric,
            garbage = garbage,
        )
    }

    private fun buildFooterCutoffByPage(
        lines: List<OcrLine>,
        fromPage: Int,
        minTopOnHeaderPage: Int,
    ): Map<Int, Int> {
        val result = mutableMapOf<Int, Int>()
        lines
            .filter { line -> line.page >= fromPage }
            .forEach { line ->
                val normalized = normalizeText(line.text)
                if (!isFooterMarkerLine(normalized)) return@forEach
                if (line.page == fromPage && line.top <= minTopOnHeaderPage) return@forEach
                val current = result[line.page]
                if (current == null || line.top < current) {
                    result[line.page] = line.top
                }
            }
        return result
    }

    private fun isFooterMarkerLine(normalizedLine: String): Boolean {
        return tableFooterMarkers.any { marker -> normalizedLine.contains(marker) }
    }

    private fun isGarbageRowDescription(description: String): Boolean {
        val normalized = normalizeText(description)
        if (normalized.isBlank()) return true
        if (!normalized.any { it.isLetter() }) return true
        if (containsAnyTerm(normalized, recipientAreaMarkers)) return true
        if (containsAnyTerm(normalized, contactMarkers)) return true
        if (isLikelyAddress(normalized)) return true
        if (dataStopwords.any { marker ->
                normalized == marker ||
                    normalized.startsWith("$marker ") ||
                    normalized.contains(" $marker ")
            }
        ) {
            return true
        }
        return false
    }

    private fun parseRowsWithHeader(
        headerLine: OcrLine,
        allTokens: List<OcrToken>,
        pageWidth: Int,
        rowTolerancePx: Int,
    ): List<ParsedItem> {
        val anchors = detectColumnAnchors(headerLine)
        val ranges = buildColumnRanges(anchors, pageWidth)

        val tokensByPage = allTokens.groupBy { it.page }
        val rows = mutableListOf<List<OcrToken>>()

        for ((page, pageTokens) in tokensByPage) {
            val filtered = pageTokens
                .filter { token -> (page > headerLine.page) || (page == headerLine.page && token.top > headerLine.bottom + 4) }
                .sortedBy { it.centerY }
            rows += groupTokensByRow(filtered, rowTolerancePx)
        }

        return rows.mapNotNull { rowTokens ->
            val rowText = rowTokens.sortedBy { it.left }.joinToString(" ") { it.text.trim() }.trim()
            if (rowText.isBlank()) return@mapNotNull null
            if (subtotalRegex.containsMatchIn(normalizeText(rowText))) return@mapNotNull null

            val materialText = textForColumn(rowTokens, ranges[Column.MATERIAL]).ifBlank { fallbackMaterial(rowTokens) }.trim()
            val quantityRaw = textForColumn(rowTokens, ranges[Column.CANTIDAD])
            val unitRaw = textForColumn(rowTokens, ranges[Column.UNIDAD])
            val quantityUnit = parseQuantityAndUnit(quantityRaw)
            val quantity = quantityUnit.first ?: parseDecimalEs(quantityRaw)
            val unit = normalizeUnit(unitRaw.ifBlank { quantityUnit.second ?: detectUnitToken(rowTokens) })
            val unitPrice = parseDecimalEs(textForColumn(rowTokens, ranges[Column.PRECIO]))
            val costDoc = parseDecimalEs(textForColumn(rowTokens, ranges[Column.COSTE]))

            if (materialText.isBlank() && quantity == null && unitPrice == null && costDoc == null) return@mapNotNull null

            ParsedItem(
                material = materialText,
                quantity = quantity,
                unit = unit,
                unitPrice = unitPrice,
                costDoc = costDoc,
                rowText = rowText,
                missingCritical = materialText.isBlank() || quantity == null || unit == null,
            )
        }
    }

    private fun parseRowsWithoutHeader(lines: List<OcrLine>): List<ParsedItem> {
        return lines.mapNotNull { line ->
            val raw = line.text.trim()
            if (raw.isBlank()) return@mapNotNull null
            val normalized = normalizeText(raw)
            if (subtotalRegex.containsMatchIn(normalized)) return@mapNotNull null
            if (containsAny(normalized, dictionaries.normalizedFieldSynonyms("numeroDocumento"))) return@mapNotNull null
            if (containsAny(normalized, dictionaries.normalizedFieldSynonyms("fecha"))) return@mapNotNull null
            if (containsAny(normalized, dictionaries.normalizedFieldSynonyms("proveedor"))) return@mapNotNull null

            val numberMatches = Regex("[-+]?\\d[\\d.,]*").findAll(raw).map { it.value }.toList()
            if (numberMatches.isEmpty()) return@mapNotNull null

            val quantityUnit = parseQuantityAndUnit(raw)
            val quantity = quantityUnit.first ?: numberMatches.getOrNull(0)?.let { parseDecimalEs(it) }
            val unit = normalizeUnit(quantityUnit.second ?: raw)
            val unitPrice = numberMatches.getOrNull(1)?.let { parseDecimalEs(it) }
            val costDoc = numberMatches.getOrNull(2)?.let { parseDecimalEs(it) }

            val material = raw
                .replace(Regex("[-+]?\\d[\\d.,]*"), " ")
                .replace(Regex("\\b(UD|UDS|UN|UNID|KG|L|ML|M2|M3|H|HR|HORA|HORAS|TN|T)\\b", RegexOption.IGNORE_CASE), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
            if (material.isBlank()) return@mapNotNull null

            ParsedItem(
                material = material,
                quantity = quantity,
                unit = unit,
                unitPrice = unitPrice,
                costDoc = costDoc,
                rowText = raw,
                missingCritical = quantity == null || unit == null,
            )
        }
    }

    private fun detectColumnAnchors(headerLine: OcrLine): Map<Column, Int> {
        val anchors = mutableMapOf<Column, Int>()
        val desc = strictDescriptionSynonyms
        val qty = strictQuantitySynonyms
        val unit = dictionaries.normalizedColumnSynonyms("unidad")
        val price = strictPriceSynonyms
        val cost = strictAmountSynonyms

        for (token in headerLine.tokens.sortedBy { it.left }) {
            val value = normalizeText(token.text)
            if (!anchors.containsKey(Column.MATERIAL) && containsAny(value, desc)) {
                anchors[Column.MATERIAL] = token.left
                continue
            }
            if (!anchors.containsKey(Column.CANTIDAD) && containsAny(value, qty)) {
                anchors[Column.CANTIDAD] = token.left
                continue
            }
            if (!anchors.containsKey(Column.UNIDAD) && containsAny(value, unit)) {
                anchors[Column.UNIDAD] = token.left
                continue
            }
            if (!anchors.containsKey(Column.PRECIO) && containsAny(value, price)) {
                anchors[Column.PRECIO] = token.left
                continue
            }
            if (!anchors.containsKey(Column.COSTE) && containsAny(value, cost)) {
                anchors[Column.COSTE] = token.left
            }
        }

        return anchors
    }

    private fun buildColumnRanges(rawAnchors: Map<Column, Int>, pageWidth: Int): Map<Column, ColumnRange> {
        val anchors = mutableMapOf<Column, Int>(
            Column.MATERIAL to 0,
            Column.CANTIDAD to (pageWidth * 0.44).toInt(),
            Column.PRECIO to (pageWidth * 0.73).toInt(),
            Column.COSTE to (pageWidth * 0.86).toInt(),
        )
        if (rawAnchors.containsKey(Column.UNIDAD)) {
            anchors[Column.UNIDAD] = rawAnchors.getValue(Column.UNIDAD)
        }
        rawAnchors.forEach { (column, anchorX) ->
            anchors[column] = anchorX.coerceIn(0, pageWidth)
        }

        val sorted = anchors.entries.sortedBy { it.value }
        val boundaries = mutableListOf(0)
        for (index in 0 until sorted.lastIndex) {
            boundaries.add((sorted[index].value + sorted[index + 1].value) / 2)
        }
        boundaries.add(pageWidth + 1)

        val ranges = mutableMapOf<Column, ColumnRange>()
        for ((index, entry) in sorted.withIndex()) {
            ranges[entry.key] = ColumnRange(boundaries[index], boundaries[index + 1])
        }
        return ranges
    }

    private fun groupTokensByRow(tokens: List<OcrToken>, tolerancePx: Int): List<List<OcrToken>> {
        if (tokens.isEmpty()) return emptyList()
        val groups = mutableListOf<MutableList<OcrToken>>()
        val centers = mutableListOf<Int>()

        for (token in tokens) {
            if (groups.isEmpty()) {
                groups.add(mutableListOf(token))
                centers.add(token.centerY)
                continue
            }
            val lastIndex = groups.lastIndex
            if (abs(token.centerY - centers[lastIndex]) <= tolerancePx) {
                groups[lastIndex].add(token)
                centers[lastIndex] = groups[lastIndex].map { it.centerY }.average().toInt()
            } else {
                groups.add(mutableListOf(token))
                centers.add(token.centerY)
            }
        }

        return groups.map { row -> row.sortedBy { it.left } }
    }

    private fun textForColumn(tokens: List<OcrToken>, range: ColumnRange?): String {
        if (range == null) return ""
        return tokens
            .filter { token -> token.centerX in range.startX..range.endX }
            .sortedBy { it.left }
            .joinToString(" ") { it.text.trim() }
            .trim()
    }

    private fun fallbackMaterial(tokens: List<OcrToken>): String {
        return tokens.sortedBy { it.left }.joinToString(" ") { it.text.trim() }
            .replace(Regex("[-+]?\\d[\\d.,]*"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun detectUnitToken(tokens: List<OcrToken>): String {
        return tokens.joinToString(" ") { it.text.trim() }
    }

    private fun parseQuantityAndUnit(raw: String?): Pair<Double?, String?> {
        if (raw.isNullOrBlank()) return Pair(null, null)
        val match = Regex("([-+]?\\d[\\d.,]*)\\s*([A-Za-z\\u00BA\\u00B0\\u00B2\\u00B3.]{1,8})").find(raw)
        if (match == null) return Pair(null, null)
        return Pair(parseDecimalEs(match.groupValues[1]), normalizeUnit(match.groupValues[2]))
    }
    private fun normalizeText(value: String): String {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .uppercase()
            // Handle common OCR variants for N°/Nº and mojibake forms.
            .replace(Regex("\\bN\\s*[\\u00BA\\u00B0]\\s*"), " NUMERO ")
            .replace(Regex("\\bNA\\s*[\\u00BA\\u00B0]\\s*"), " NUMERO ")
            .replace(Regex("\\bNO\\.?\\b"), " NUMERO ")
            .replace(Regex("[^A-Z0-9/., -]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun strictColumnSynonyms(
        source: List<String>,
        blocked: List<String>,
        fallback: List<String>,
    ): List<String> {
        val blockedNormalized = blocked.map { term -> normalizeText(term) }
        val filtered = source.filterNot { candidate ->
            blockedNormalized.any { blockedTerm ->
                candidate == blockedTerm || candidate.contains(blockedTerm)
            }
        }.distinct()

        if (filtered.isNotEmpty()) return filtered
        return fallback.map { term -> normalizeText(term) }.distinct()
    }

    private fun containsAny(haystackNormalized: String, normalizedCandidates: List<String>): Boolean {
        return normalizedCandidates.any { it.isNotBlank() && haystackNormalized.contains(it) }
    }

    private fun countMarkerHits(haystackNormalized: String, normalizedCandidates: List<String>): Int {
        return normalizedCandidates.count { it.isNotBlank() && haystackNormalized.contains(it) }
    }

    private fun countExplicitHits(haystackNormalized: String, terms: List<String>): Int {
        return terms.count { term -> haystackNormalized.contains(term) }
    }

    private fun logDebug(message: String) {
        runCatching { Log.d(LOG_TAG, message) }
    }

    private fun logInfo(message: String) {
        runCatching { Log.i(LOG_TAG, message) }
    }

    private fun isPotentialCompanyName(text: String): Boolean {
        val normalized = normalizeText(text)
        if (normalized.length < 4) return false
        if (!normalized.any { it.isLetter() }) return false
        if (isBadSupplierCandidate(normalized)) return false
        if (containsAnyTerm(normalized, recipientAreaMarkers)) return false
        return true
    }

    private fun isRecipientHint(text: String): Boolean {
        return containsAnyTerm(normalizeText(text), recipientAreaMarkers)
    }

    private fun containsAnyTerm(haystackNormalized: String, rawTerms: List<String>): Boolean {
        val compactHaystack = haystackNormalized
            .replace(Regex("[^A-Z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        return rawTerms
            .asSequence()
            .map { term -> normalizeText(term) }
            .filter { term -> term.length >= 2 }
            .any { term ->
                haystackNormalized.contains(term) || compactHaystack.contains(term)
            }
    }

    private fun isBadSupplierCandidate(normalizedText: String): Boolean {
        if (normalizedText.isBlank()) return true
        if (!normalizedText.any { it.isLetter() }) return true
        return badSupplierTerms.any { term ->
            val normalizedTerm = normalizeText(term)
            normalizedText == normalizedTerm ||
                normalizedText.startsWith("$normalizedTerm ") ||
                normalizedText.contains(" $normalizedTerm ")
        }
    }

    private fun cleanSupplierName(raw: String): String {
        return raw
            .replace(Regex("^[\\-:;,.\\s]+"), "")
            .replace(Regex("[\\-:;,.\\s]+$"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun normalizeSupplierForDedupe(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val cleaned = normalizeText(raw)
            .replace(Regex("\\bS\\s*L\\s*U\\b"), " ")
            .replace(Regex("\\bS\\s*L\\b"), " ")
            .replace(Regex("\\bS\\s*A\\b"), " ")
            .replace(Regex("\\bSOCIEDAD LIMITADA\\b"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        return cleaned.ifBlank { null }
    }

    private fun stripKnownLabelPrefix(text: String): String {
        val normalized = normalizeText(text)
        val labelRegex = Regex("^(EMPRESA|EMISOR|SUMINISTRADOR|VENDEDOR|RAZON SOCIAL|DATOS FISCALES)\\s*[:\\-]?\\s*")
        val stripped = labelRegex.replace(normalized, "")
        return if (stripped != normalized && stripped.isNotBlank()) stripped else text.trim()
    }

    private fun buildContextWindow(lines: List<OcrLine>, index: Int): String {
        val from = (index - 1).coerceAtLeast(0)
        val to = (index + 1).coerceAtMost(lines.lastIndex)
        return (from..to).joinToString(" ") { idx -> normalizeText(lines[idx].text) }
    }

    private fun addSupplierCandidate(
        out: MutableList<ScoredCandidate>,
        rawValue: String?,
        contextNormalized: String,
        reason: String,
    ) {
        val candidate = cleanSupplierName(rawValue ?: "")
        if (candidate.isBlank()) return
        val normalized = normalizeText(candidate)
        if (!isPotentialCompanyName(candidate)) return
        val score = scoreSupplierCandidate(normalized, contextNormalized, reason)
        if (score <= 0.0) {
            logDebug("supplierRejected value=$candidate reason=$reason context=$contextNormalized")
            return
        }
        out.add(ScoredCandidate(candidate, score, reason))
    }

    private fun scoreSupplierCandidate(
        normalizedValue: String,
        contextNormalized: String,
        reason: String,
    ): Double {
        var score = 0.0
        if (containsAnyTerm(normalizedValue, companyHintMarkers)) score += 2.4
        if (containsAnyTerm(contextNormalized, contactMarkers)) score += 1.6
        if (containsAnyTerm(normalizedValue, contactMarkers)) score += 1.3
        if (normalizedValue.split(" ").count { it.length >= 2 } >= 2) score += 1.1
        if (normalizedValue.length >= 12) score += 0.7
        if (reason.contains("footer")) score += 0.5
        if (reason.contains("label")) score += 0.4
        if (containsAnyTerm(contextNormalized, recipientAreaMarkers)) score -= 2.5
        if (containsAnyTerm(normalizedValue, recipientAreaMarkers)) score -= 3.2
        if (isLikelyAddress(normalizedValue)) score -= 4.2
        if (isLikelyPhoneNumber(normalizedValue)) score -= 2.8
        if (normalizedValue.count { it.isDigit() } >= 5) score -= 1.6
        if (normalizedValue.split(" ").size >= 6) score -= 1.0
        if (isBadSupplierCandidate(normalizedValue)) score -= 4.5
        return score
    }

    private fun isLikelyAddress(normalizedValue: String): Boolean {
        if (normalizedValue.length < 8) return false
        val hasStreet = Regex("\\b(CALLE|C\\/|AVENIDA|AVDA|PLAZA|TRAVESIA|POLIGONO|NAVE)\\b").containsMatchIn(normalizedValue)
        val hasPostal = Regex("\\b\\d{5}\\b").containsMatchIn(normalizedValue)
        return hasStreet || (hasPostal && normalizedValue.split(" ").size >= 3)
    }

    private fun isLikelyPhoneNumber(normalizedValue: String): Boolean {
        val digits = normalizedValue.filter { it.isDigit() }
        return digits.length >= 8 && normalizedValue.split(" ").size <= 3
    }

    private fun topPageAreaLines(lines: List<OcrLine>, ratio: Float): List<OcrLine> {
        if (lines.isEmpty()) return emptyList()
        val minTop = lines.minOf { line -> line.top }
        val maxBottom = lines.maxOf { line -> line.bottom }
        val height = (maxBottom - minTop).coerceAtLeast(1)
        val topLimit = minTop + (height * ratio).toInt().coerceAtLeast(1)
        val filtered = lines.filter { line -> line.top <= topLimit }
        return if (filtered.isNotEmpty()) filtered else lines.take(12)
    }

    private fun bottomPageAreaLines(lines: List<OcrLine>, ratio: Float): List<OcrLine> {
        if (lines.isEmpty()) return emptyList()
        val minTop = lines.minOf { line -> line.top }
        val maxBottom = lines.maxOf { line -> line.bottom }
        val height = (maxBottom - minTop).coerceAtLeast(1)
        val threshold = maxBottom - (height * ratio).toInt().coerceAtLeast(1)
        val filtered = lines.filter { line -> line.bottom >= threshold }
        return if (filtered.isNotEmpty()) filtered else lines.takeLast(12)
    }

    private fun extractDateFromText(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val normalized = normalizeText(raw)
        dateRegex.find(normalized)?.let { match ->
            return normalizeDateParts(match.groupValues[1], match.groupValues[2], match.groupValues[3])
        }

        val monthRegex = Regex("\\b(\\d{1,2})\\s+([A-Z]+)\\s+(\\d{2,4})\\b")
        monthRegex.find(normalized)?.let { match ->
            val day = match.groupValues[1].toIntOrNull()
            val month = monthMap[match.groupValues[2]]
            val year = normalizeYear(match.groupValues[3].toIntOrNull())
            if (day != null && month != null && year != null && isValidDate(day, month, year)) {
                return String.format("%04d-%02d-%02d", year, month, day)
            }
        }
        return null
    }

    private fun isValidInvoiceNumber(raw: String): Boolean {
        val candidate = raw.trim().trimEnd('.', '-', ':')
        if (candidate.length < 3) return false
        if (candidate.length > 24) return false
        if (!candidate.any { it.isDigit() }) return false
        if (candidate.count { it.isDigit() } < 3) return false
        return candidate.all { it.isLetterOrDigit() || it == '-' || it == '/' || it == '.' }
    }

    private fun normalizeDateParts(dayRaw: String, monthRaw: String, yearRaw: String): String? {
        val day = dayRaw.toIntOrNull() ?: return null
        val month = monthRaw.toIntOrNull() ?: return null
        val year = normalizeYear(yearRaw.toIntOrNull()) ?: return null
        if (!isValidDate(day, month, year)) return null
        return String.format("%04d-%02d-%02d", year, month, day)
    }

    private fun normalizeYear(year: Int?): Int? {
        if (year == null) return null
        return when {
            year in 2000..2099 -> year
            year in 0..49 -> 2000 + year
            else -> null
        }
    }

    private fun isValidDate(day: Int, month: Int, year: Int): Boolean {
        if (month !in 1..12) return false
        if (day !in 1..31) return false
        if (year !in 2000..2099) return false
        val maxDay = when (month) {
            1, 3, 5, 7, 8, 10, 12 -> 31
            4, 6, 9, 11 -> 30
            2 -> if (isLeapYear(year)) 29 else 28
            else -> 0
        }
        return day <= maxDay
    }

    private fun isLeapYear(year: Int): Boolean {
        return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
    }

    private fun inferConfidence(
        ocrConfidence: String,
        score: Double,
        warnings: Set<String>,
        docType: ParsedDocType,
        hasItems: Boolean,
        noPriceColumns: Boolean,
    ): String {
        if (warnings.contains("LOW_TEXT") || warnings.contains("BLUR")) return "low"
        if (warnings.contains("NO_TABLE_STRONG")) {
            return if (score >= 60.0 && ocrConfidence != "low") "medium" else "low"
        }
        if (docType == ParsedDocType.UNKNOWN) return "low"
        if (docType == ParsedDocType.MATERIALS_TABLE && !hasItems && !noPriceColumns) return "low"
        if (noPriceColumns && score >= 48.0) return "medium"
        if (score >= 78.0 && ocrConfidence != "low") return "high"
        if (score >= 56.0) return "medium"
        return "low"
    }

    companion object {
        private const val LOG_TAG = "ALBARAN_OCR"

        fun parseDecimalEs(value: String?): Double? {
            if (value == null) return null
            var cleaned = value.trim()
            if (cleaned.isEmpty()) return null

            cleaned = cleaned.replace(Regex("[^0-9,.-]"), "")
            if (cleaned.isEmpty()) return null

            val commaIndex = cleaned.lastIndexOf(',')
            val dotIndex = cleaned.lastIndexOf('.')

            val normalized = when {
                commaIndex >= 0 && dotIndex >= 0 -> {
                    if (commaIndex > dotIndex) {
                        cleaned.replace(".", "").replace(',', '.')
                    } else {
                        cleaned.replace(",", "")
                    }
                }
                commaIndex >= 0 -> cleaned.replace(".", "").replace(',', '.')
                else -> {
                    if (cleaned.count { it == '.' } > 1) {
                        val lastDot = cleaned.lastIndexOf('.')
                        val whole = cleaned.substring(0, lastDot).replace(".", "")
                        val decimals = cleaned.substring(lastDot + 1)
                        "$whole.$decimals"
                    } else {
                        cleaned
                    }
                }
            }

            return normalized.toDoubleOrNull()
        }
        fun normalizeUnit(value: String?): String? {
            if (value == null) return null
            val normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
                .replace(Regex("[\\u00B2]"), "2")
                .replace(Regex("[\\u00B3]"), "3")
                .replace(Regex("[\\u00BA\\u00B0]"), "o")
                .lowercase()
                .replace(Regex("[^a-z0-9]"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()

            if (normalized.isBlank()) return null
            if (Regex("\\bm\\s*2\\b").containsMatchIn(normalized)) return "m2"
            if (Regex("\\bm\\s*3\\b").containsMatchIn(normalized)) return "m3"
            if (Regex("\\bm\\b").containsMatchIn(normalized)) return "m"
            if (Regex("\\buds?\\b|\\bud\\b|\\bun\\b|\\bunidad(?:es)?\\b").containsMatchIn(normalized)) return "ud"
            if (Regex("\\blt\\b|\\blitro(?:s)?\\b|\\bl\\b").containsMatchIn(normalized)) return "l"
            if (Regex("\\bml\\b").containsMatchIn(normalized)) return "ml"
            if (Regex("\\bkg\\b|\\bkilo(?:s)?\\b").containsMatchIn(normalized)) return "kg"
            if (Regex("\\bg\\b|\\bgramo(?:s)?\\b").containsMatchIn(normalized)) return "g"
            if (Regex("\\bh\\b|\\bhr\\b|\\bhora(?:s)?\\b").containsMatchIn(normalized)) return "h"
            if (Regex("\\btn\\b|\\bton(?:elada)?s?\\b|\\bt\\b").containsMatchIn(normalized)) return "tn"
            if (Regex("\\bpaq\\b|\\bpaquete(?:s)?\\b").containsMatchIn(normalized)) return "paq"
            if (Regex("\\bcaja(?:s)?\\b").containsMatchIn(normalized)) return "caja"
            return null
        }
    }
}







