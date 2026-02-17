package com.partesdetrabajo.app

import java.text.Normalizer
import kotlin.math.abs
import kotlin.math.max

data class ParsedItem(
    val material: String,
    val quantity: Double?,
    val unit: String?,
    val unitPrice: Double?,
    val costDoc: Double?,
    val rowText: String,
    val missingCritical: Boolean,
)

data class ParsedDeliveryNote(
    val supplier: String?,
    val invoiceNumber: String?,
    val items: List<ParsedItem>,
    val requiresReview: Boolean,
    val reviewReason: String?,
    val headerDetected: Boolean,
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

class AlbaranOcrParser {
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

    private val subtotalRegex = Regex(
        "\\b(TOTAL|SUBTOTAL|IVA|BASE|RECARGO|DESCUENTO|RETENCION|RESUMEN)\\b",
        RegexOption.IGNORE_CASE,
    )

    private val invoiceRegexes = listOf(
        Regex("(?i)\\bALBARAN\\s*(?:N(?:RO|UM)?|NUM(?:ERO)?)?\\s*[:#\\-]?\\s*([A-Z0-9\\-\\/.]{3,})"),
        Regex("(?i)\\b(?:N(?:RO|UM)?|NUM(?:ERO)?)\\s*(?:DE\\s*)?(?:ALBARAN)?\\s*[:#\\-]?\\s*([A-Z0-9\\-\\/.]{3,})"),
    )

    fun parse(
        lines: List<OcrLine>,
        tokens: List<OcrToken>,
        pageWidth: Int,
        rowTolerancePx: Int = 18,
    ): ParsedDeliveryNote {
        if (lines.isEmpty() || tokens.isEmpty()) {
            return ParsedDeliveryNote(
                supplier = null,
                invoiceNumber = null,
                items = emptyList(),
                requiresReview = true,
                reviewReason = "No se detecto texto en el albaran",
                headerDetected = false,
            )
        }

        val orderedLines = lines.sortedWith(compareBy<OcrLine> { it.page }.thenBy { it.top })
        val supplier = extractSupplier(orderedLines)
        val invoiceNumber = extractInvoiceNumber(orderedLines)
        val headerLine = findHeaderLine(orderedLines)

        val parsedItems = if (headerLine == null) {
            parseRowsWithoutHeader(orderedLines)
        } else {
            parseRowsWithHeader(
                headerLine = headerLine,
                allTokens = tokens,
                pageWidth = pageWidth,
                rowTolerancePx = rowTolerancePx,
            )
        }

        val filteredItems = parsedItems.filter { item ->
            val text = item.rowText.ifBlank { item.material }
            text.isNotBlank() && !subtotalRegex.containsMatchIn(normalizeText(text))
        }

        val missingCriticalCount = filteredItems.count { it.missingCritical }
        val headerDetected = headerLine != null
        val requiresReview = !headerDetected ||
            filteredItems.isEmpty() ||
            missingCriticalCount > max(1, filteredItems.size / 3)

        val reason = when {
            !headerDetected -> "No se detecto cabecera de tabla"
            filteredItems.isEmpty() -> "No se pudieron extraer lineas de material"
            missingCriticalCount > max(1, filteredItems.size / 3) -> "Faltan datos clave en varias filas"
            else -> null
        }

        return ParsedDeliveryNote(
            supplier = supplier,
            invoiceNumber = invoiceNumber,
            items = filteredItems,
            requiresReview = requiresReview,
            reviewReason = reason,
            headerDetected = headerDetected,
        )
    }

    private fun extractSupplier(lines: List<OcrLine>): String? {
        val keywords = listOf("PROVEEDOR", "SUMINISTRADOR", "EMPRESA", "EMITIDO POR")
        for ((index, line) in lines.withIndex()) {
            val normalized = normalizeText(line.text)
            val matched = keywords.any { keyword -> normalized.contains(keyword) }
            if (!matched) continue

            val colonIndex = line.text.indexOf(':')
            if (colonIndex >= 0 && colonIndex + 1 < line.text.length) {
                val value = line.text.substring(colonIndex + 1).trim()
                if (value.length > 2) return value
            }

            val next = lines.getOrNull(index + 1)?.text?.trim().orEmpty()
            if (next.length > 2 && !subtotalRegex.containsMatchIn(normalizeText(next))) {
                return next
            }
        }

        return lines
            .take(12)
            .map { it.text.trim() }
            .firstOrNull { candidate ->
                val n = normalizeText(candidate)
                candidate.length > 3 &&
                    n.any { it.isLetter() } &&
                    !n.contains("ALBARAN") &&
                    !n.contains("FACTURA") &&
                    !n.contains("CIF") &&
                    !n.contains("NIF") &&
                    !n.contains("FECHA")
            }
    }

    private fun extractInvoiceNumber(lines: List<OcrLine>): String? {
        for (line in lines) {
            val text = line.text.trim()
            if (text.isEmpty()) continue

            val normalized = normalizeText(text)
            for (regex in invoiceRegexes) {
                val match = regex.find(normalized) ?: continue
                val value = match.groupValues.getOrNull(1)?.trim().orEmpty()
                if (value.length >= 3) return value.trimEnd('.', '-', ':')
            }
        }
        return null
    }

    private fun findHeaderLine(lines: List<OcrLine>): OcrLine? {
        var bestLine: OcrLine? = null
        var bestScore = 0
        for (line in lines) {
            val score = scoreHeaderLine(line.text)
            if (score > bestScore) {
                bestScore = score
                bestLine = line
            }
        }
        return if (bestScore >= 3) bestLine else null
    }

    private fun scoreHeaderLine(text: String): Int {
        val normalized = normalizeText(text)
        var score = 0
        if (
            normalized.contains("MATERIAL") ||
            normalized.contains("DESCRIPCION") ||
            normalized.contains("CONCEPTO") ||
            normalized.contains("ARTICULO")
        ) score += 1
        if (normalized.contains("CANT")) score += 1
        if (normalized.contains("UNID") || normalized.contains(" UD ")) score += 1
        if (normalized.contains("PREC")) score += 1
        if (normalized.contains("COSTE") || normalized.contains("IMPORTE") || normalized.contains("TOTAL")) score += 1
        return score
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
                .filter { token ->
                    (page > headerLine.page) || (page == headerLine.page && token.top > headerLine.bottom + 4)
                }
                .sortedBy { it.centerY }
            rows += groupTokensByRow(filtered, rowTolerancePx)
        }

        return rows.mapNotNull { rowTokens ->
            val rowText = rowTokens.sortedBy { it.left }.joinToString(" ") { token -> token.text.trim() }.trim()
            if (rowText.isBlank()) return@mapNotNull null
            if (subtotalRegex.containsMatchIn(normalizeText(rowText))) return@mapNotNull null

            val materialText = textForColumn(rowTokens, ranges[Column.MATERIAL])
                .ifBlank { fallbackMaterial(rowTokens) }
                .trim()

            val quantity = parseDecimalEs(textForColumn(rowTokens, ranges[Column.CANTIDAD]))
            val unit = normalizeUnit(textForColumn(rowTokens, ranges[Column.UNIDAD]).ifBlank { detectUnitToken(rowTokens) })
            val unitPrice = parseDecimalEs(textForColumn(rowTokens, ranges[Column.PRECIO]))
            val costDoc = parseDecimalEs(textForColumn(rowTokens, ranges[Column.COSTE]))

            if (materialText.isBlank() && quantity == null && unitPrice == null && costDoc == null) {
                return@mapNotNull null
            }

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

            val numberMatches = Regex("[-+]?\\d[\\d.,]*").findAll(raw).map { it.value }.toList()
            if (numberMatches.isEmpty()) return@mapNotNull null

            val quantity = numberMatches.getOrNull(0)?.let { parseDecimalEs(it) }
            val unitPrice = numberMatches.getOrNull(1)?.let { parseDecimalEs(it) }
            val costDoc = numberMatches.getOrNull(2)?.let { parseDecimalEs(it) }
            val unit = normalizeUnit(raw)

            val material = raw
                .replace(Regex("[-+]?\\d[\\d.,]*"), " ")
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
        for (token in headerLine.tokens.sortedBy { it.left }) {
            val value = normalizeText(token.text)
            if (!anchors.containsKey(Column.MATERIAL) &&
                (value.contains("MATERIAL") || value.contains("DESCRIP") || value.contains("CONCEPTO") || value.contains("ARTIC"))
            ) {
                anchors[Column.MATERIAL] = token.left
                continue
            }
            if (!anchors.containsKey(Column.CANTIDAD) && value.contains("CANT")) {
                anchors[Column.CANTIDAD] = token.left
                continue
            }
            if (!anchors.containsKey(Column.UNIDAD) && (value.contains("UNID") || value == "UD" || value == "U")) {
                anchors[Column.UNIDAD] = token.left
                continue
            }
            if (!anchors.containsKey(Column.PRECIO) && (value.contains("PREC") || value.contains("PVP"))) {
                anchors[Column.PRECIO] = token.left
                continue
            }
            if (!anchors.containsKey(Column.COSTE) && (value.contains("COSTE") || value.contains("IMPORTE") || value == "IMP" || value == "TOTAL")) {
                anchors[Column.COSTE] = token.left
            }
        }
        return anchors
    }

    private fun buildColumnRanges(
        rawAnchors: Map<Column, Int>,
        pageWidth: Int,
    ): Map<Column, ColumnRange> {
        val anchors = if (rawAnchors.size >= 3) {
            rawAnchors.toMutableMap()
        } else {
            mutableMapOf(
                Column.MATERIAL to 0,
                Column.CANTIDAD to (pageWidth * 0.46).toInt(),
                Column.UNIDAD to (pageWidth * 0.62).toInt(),
                Column.PRECIO to (pageWidth * 0.74).toInt(),
                Column.COSTE to (pageWidth * 0.86).toInt(),
            )
        }

        if (!anchors.containsKey(Column.MATERIAL)) anchors[Column.MATERIAL] = 0
        if (!anchors.containsKey(Column.CANTIDAD)) anchors[Column.CANTIDAD] = (pageWidth * 0.46).toInt()
        if (!anchors.containsKey(Column.UNIDAD)) anchors[Column.UNIDAD] = (pageWidth * 0.62).toInt()
        if (!anchors.containsKey(Column.PRECIO)) anchors[Column.PRECIO] = (pageWidth * 0.74).toInt()
        if (!anchors.containsKey(Column.COSTE)) anchors[Column.COSTE] = (pageWidth * 0.86).toInt()

        val sorted = anchors.entries.sortedBy { it.value }
        val boundaries = mutableListOf<Int>()
        boundaries.add(0)
        for (index in 0 until sorted.lastIndex) {
            val current = sorted[index].value
            val next = sorted[index + 1].value
            boundaries.add((current + next) / 2)
        }
        boundaries.add(pageWidth + 1)

        val ranges = mutableMapOf<Column, ColumnRange>()
        for ((index, entry) in sorted.withIndex()) {
            val start = boundaries[index]
            val end = boundaries[index + 1]
            ranges[entry.key] = ColumnRange(startX = start, endX = end)
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
            val currentCenter = centers[lastIndex]
            if (abs(token.centerY - currentCenter) <= tolerancePx) {
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
            .joinToString(" ") { token -> token.text.trim() }
            .trim()
    }

    private fun fallbackMaterial(tokens: List<OcrToken>): String {
        val rowText = tokens.sortedBy { it.left }.joinToString(" ") { token -> token.text.trim() }
        return rowText
            .replace(Regex("[-+]?\\d[\\d.,]*"), " ")
            .replace(Regex("\\b(UD|UDS|UN|UNID|KG|L|ML|M2|M3)\\b", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun detectUnitToken(tokens: List<OcrToken>): String {
        return tokens.joinToString(" ") { token -> token.text.trim() }
    }

    private fun normalizeText(value: String): String {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .uppercase()
            .replace(Regex("[^A-Z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    companion object {
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

            val preNormalized = value
                .replace("²", "2")
                .replace("³", "3")

            val normalized = Normalizer.normalize(preNormalized, Normalizer.Form.NFD)
                .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
                .lowercase()
                .replace(Regex("[^a-z0-9]"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()

            if (normalized.isBlank()) return null
            if (Regex("\\bm2\\b").containsMatchIn(normalized)) return "m2"
            if (Regex("\\bm3\\b").containsMatchIn(normalized)) return "m3"
            if (Regex("\\buds?\\b|\\bud\\b|\\bun\\b|\\bunidad(?:es)?\\b").containsMatchIn(normalized)) return "ud"
            if (Regex("\\blt\\b|\\blitro(?:s)?\\b|\\bl\\b").containsMatchIn(normalized)) return "l"
            if (Regex("\\bml\\b").containsMatchIn(normalized)) return "ml"
            if (Regex("\\bkg\\b|\\bkilo(?:s)?\\b").containsMatchIn(normalized)) return "kg"
            return normalized.split(" ").firstOrNull { token -> token.isNotBlank() }
        }
    }
}
