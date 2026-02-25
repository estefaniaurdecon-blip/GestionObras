package com.partesdetrabajo.app

import android.content.res.AssetManager
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

data class AlbaranParserDictionaries(
    val fieldSynonyms: Map<String, List<String>>,
    val columnSynonyms: Map<String, List<String>>,
    val docTypeMarkers: Map<String, List<String>>,
) {
    companion object {
        private val defaultFieldSynonyms = mapOf(
            "numeroDocumento" to listOf(
                "ALBARAN", "ALBARAN NUMERO", "N", "Nº", "N°", "NO", "NO.", "NUM", "NUMERO", "NRO",
                "REF", "REFERENCIA", "DOCUMENTO", "NOTA DE ENTREGA", "N. ENTREGA", "DELIVERY NOTE",
            ),
            "proveedor" to listOf(
                "EMPRESA", "EMISOR", "SUMINISTRADOR", "VENDEDOR", "RAZON SOCIAL", "DATOS FISCALES", "PROVEEDOR",
            ),
            "fecha" to listOf("FECHA", "EMISION", "EMITIDO", "DATE"),
        )

        private val defaultColumnSynonyms = mapOf(
            "descripcion" to listOf(
                "MATERIAL", "CONCEPTO", "DESCRIPCION", "ARTICULO",
                "PRODUCTO", "DESCR.",
            ),
            "cantidad" to listOf(
                "CANTIDAD", "CANT.", "QTY", "UNIDADES",
            ),
            "unidad" to listOf(
                "UNIDAD", "UD", "UDS", "UN", "U.", "UNID", "ML", "ML.", "M2", "M3", "KG", "L", "LT", "TN", "T",
            ),
            "precio" to listOf(
                "PRECIO", "PRECIO/UD", "P.U.", "EUR/UD", "UNIT PRICE",
            ),
            "importe" to listOf(
                "COSTE", "IMPORTE", "TOTAL", "IMPORTE LINEA", "TOTAL EUROS",
            ),
        )

        private val defaultDocTypeMarkers = mapOf(
            "SERVICE_MACHINERY" to listOf(
                "HORAS", "DESGLOSE JORNADA", "BOMBA", "METROS BOMBEADOS", "DESPLAZAMIENTO BOMBA",
                "SERVICIO MINIMO", "MAQUINA", "OPERADOR", "MATRICULA", "PARTE DE TRABAJO", "CLASE DE TRABAJO",
                "VIAJES", "TONELADAS", "M3", "OTROS",
            ),
            "MATERIALS" to listOf(
                "ARTICULO", "DESCRIPCION", "CONCEPTO", "CANTIDAD",
                "PRECIO", "IMPORTE", "ALBARAN",
            ),
        )

        fun loadOrDefault(assetManager: AssetManager): AlbaranParserDictionaries {
            val fields = loadSynonymsJson(
                assetManager = assetManager,
                assetPath = "albaran_parser/fields_synonyms.json",
                fallback = defaultFieldSynonyms,
            )
            val columns = loadSynonymsJson(
                assetManager = assetManager,
                assetPath = "albaran_parser/columns_synonyms.json",
                fallback = defaultColumnSynonyms,
            )
            val markers = loadSynonymsJson(
                assetManager = assetManager,
                assetPath = "albaran_parser/doc_type_markers.json",
                fallback = defaultDocTypeMarkers,
            )

            return AlbaranParserDictionaries(
                fieldSynonyms = fields,
                columnSynonyms = columns,
                docTypeMarkers = markers,
            )
        }

        private fun loadSynonymsJson(
            assetManager: AssetManager,
            assetPath: String,
            fallback: Map<String, List<String>>,
        ): Map<String, List<String>> {
            return runCatching {
                val raw = assetManager.open(assetPath).bufferedReader().use { it.readText() }
                val json = JSONObject(raw)
                json.keys().asSequence().associateWith { key ->
                    val values = json.optJSONArray(key) ?: JSONArray()
                    (0 until values.length())
                        .mapNotNull { index -> values.optString(index).takeIf { text -> text.isNotBlank() } }
                        .ifEmpty { fallback[key] ?: emptyList() }
                }.ifEmpty { fallback }
            }.getOrElse { fallback }
        }
    }

    fun normalizedFieldSynonyms(key: String): List<String> = normalizeList(fieldSynonyms[key] ?: emptyList())
    fun normalizedColumnSynonyms(key: String): List<String> = normalizeList(columnSynonyms[key] ?: emptyList())
    fun normalizedDocMarkers(key: String): List<String> = normalizeList(docTypeMarkers[key] ?: emptyList())

    private fun normalizeList(values: List<String>): List<String> {
        return values.map { normalize(it) }.filter { it.isNotBlank() }.distinct()
    }

    private fun normalize(value: String): String {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .uppercase()
            // Handle common OCR variants for "Nº/No." including mojibake artifacts.
            .replace(Regex("\\bN\\s*[\\u00BA\\u00B0]\\s*"), " NUMERO ")
            .replace(Regex("\\bNA\\s*[\\u00BA\\u00B0]\\s*"), " NUMERO ")
            .replace(Regex("\\bNO\\.?\\b"), " NUMERO ")
            .replace(Regex("[^A-Z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
