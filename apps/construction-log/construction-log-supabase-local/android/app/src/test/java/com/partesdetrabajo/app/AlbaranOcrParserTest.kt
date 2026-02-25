package com.partesdetrabajo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlbaranOcrParserTest {

    private val dictionaries = AlbaranParserDictionaries(
        fieldSynonyms = mapOf(
            "numeroDocumento" to listOf("ALBARAN", "NRO", "NUMERO", "REF", "Nº", "N°"),
            "proveedor" to listOf("EMPRESA", "PROVEEDOR", "RAZON SOCIAL", "DATOS FISCALES"),
            "fecha" to listOf("FECHA"),
        ),
        columnSynonyms = mapOf(
            "descripcion" to listOf("ARTICULO", "DESCRIPCION", "CONCEPTO", "MATERIAL"),
            "cantidad" to listOf("CANTIDAD", "UNIDADES", "QTY"),
            "unidad" to listOf("UNIDAD", "UD", "UN", "ML", "M2", "M3", "H"),
            "precio" to listOf("PRECIO", "PRECIO/UD"),
            "importe" to listOf("IMPORTE", "TOTAL"),
        ),
        docTypeMarkers = mapOf(
            "SERVICE_MACHINERY" to listOf(
                "DESGLOSE JORNADA",
                "HORAS",
                "BOMBA",
                "METROS BOMBEADOS",
                "MATRICULA",
                "OPERADOR",
                "VIAJES",
                "TONELADAS",
                "PARTE DE TRABAJO",
            ),
            "MATERIALS" to listOf("ARTICULO", "DESCRIPCION", "CANTIDAD", "PRECIO", "IMPORTE"),
        ),
    )

    private val parser = AlbaranOcrParser(dictionaries)

    @Test
    fun parseDecimalEs_supportsSpanishAndInternationalFormats() {
        assertEquals(1234.56, AlbaranOcrParser.parseDecimalEs("1.234,56") ?: 0.0, 0.0001)
        assertEquals(1234.56, AlbaranOcrParser.parseDecimalEs("1234,56") ?: 0.0, 0.0001)
        assertEquals(1234.56, AlbaranOcrParser.parseDecimalEs("1234.56") ?: 0.0, 0.0001)
    }

    @Test
    fun normalizeUnit_mapsKnownUnits() {
        assertEquals("m2", AlbaranOcrParser.normalizeUnit("m2"))
        assertEquals("m3", AlbaranOcrParser.normalizeUnit("M3"))
        assertEquals("ud", AlbaranOcrParser.normalizeUnit("UDS"))
        assertEquals("l", AlbaranOcrParser.normalizeUnit("LT"))
        assertEquals("h", AlbaranOcrParser.normalizeUnit("horas"))
        assertNull(AlbaranOcrParser.normalizeUnit("oncladas"))
    }

    @Test
    fun parse_greenMontalban_materialsTable_extractsThreeRows() {
        val lines = listOf(
            line("MONTALBAN Y RODRIGUEZ S.A.", 20, 20, 420, 44, 0),
            line("ALBARAN 202600200053", 20, 50, 320, 72, 0),
            line("FECHA 07/01/2026", 340, 50, 520, 72, 0),
            line("ARTICULO DESCRIPCION CANTIDAD PRECIO IMPORTE", 10, 110, 780, 132, 0, listOf(
                token("ARTICULO", 10, 110, 92, 132, 0),
                token("DESCRIPCION", 110, 110, 248, 132, 0),
                token("CANTIDAD", 430, 110, 520, 132, 0),
                token("PRECIO", 600, 110, 660, 132, 0),
                token("IMPORTE", 710, 110, 780, 132, 0),
            )),
            line("BAJ603 BAJANTE 1ª 45*50 120.00 ML", 10, 142, 780, 164, 0, listOf(
                token("BAJ603", 10, 142, 80, 164, 0),
                token("BAJANTE", 120, 142, 200, 164, 0),
                token("120.00", 438, 142, 500, 164, 0),
                token("ML", 506, 142, 538, 164, 0),
            )),
            line("VAR919 PALETES DE MADERA 6.00 UN", 10, 168, 780, 190, 0, listOf(
                token("VAR919", 10, 168, 82, 190, 0),
                token("PALETES", 120, 168, 200, 190, 0),
                token("DE", 206, 168, 226, 190, 0),
                token("MADERA", 232, 168, 310, 190, 0),
                token("6.00", 438, 168, 490, 190, 0),
                token("UN", 500, 168, 530, 190, 0),
            )),
            line("VAR924 PORTE A JAVALI 1.00 UN", 10, 194, 780, 216, 0, listOf(
                token("VAR924", 10, 194, 82, 216, 0),
                token("PORTE", 120, 194, 184, 216, 0),
                token("A", 190, 194, 202, 216, 0),
                token("JAVALI", 208, 194, 278, 216, 0),
                token("1.00", 438, 194, 492, 216, 0),
                token("UN", 500, 194, 530, 216, 0),
            )),
            line("BASE IMPONIBLE", 10, 300, 220, 324, 0),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ENHANCED_GRAY",
            ocrScore = 79.0,
            ocrConfidence = "high",
            ocrWarnings = emptyList(),
        )

        assertEquals(
            "warnings=${result.warnings} supplier=${result.supplier} invoice=${result.invoiceNumber} items=${result.items.size}",
            ParsedDocType.MATERIALS_TABLE,
            result.docType,
        )
        assertEquals("202600200053", result.invoiceNumber)
        assertEquals(3, result.items.size)
        assertEquals(120.0, result.items[0].quantity ?: 0.0, 0.001)
        assertEquals("ml", result.items[0].unit)
        assertEquals(6.0, result.items[1].quantity ?: 0.0, 0.001)
        assertEquals("ud", result.items[1].unit)
        assertEquals(1.0, result.items[2].quantity ?: 0.0, 0.001)
        assertEquals("ud", result.items[2].unit)
    }

    @Test
    fun parse_yellowBombeos_service_detectsInvoiceAndNoItems() {
        val lines = listOf(
            line("BOMBEOS GIL GIL S.L.", 20, 20, 340, 50, 0),
            line("TEL 968627122", 20, 56, 220, 74, 0),
            line("Nº 5955", 520, 140, 680, 170, 0),
            line("HORAS TOTAL TRABAJADAS DE BOMBA 4", 40, 220, 640, 248, 0),
            line("METROS BOMBEADOS 21 M3", 40, 252, 520, 280, 0),
            line("DESPLAZAMIENTO BOMBA 1", 40, 284, 520, 312, 0),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ENHANCED_GRAY",
            ocrScore = 63.0,
            ocrConfidence = "medium",
            ocrWarnings = emptyList(),
        )

        assertEquals(ParsedDocType.SERVICE_MACHINERY, result.docType)
        assertTrue(result.supplier?.contains("BOMBEOS") == true)
        assertEquals("5955", result.invoiceNumber)
        assertTrue(result.items.isEmpty())
    }

    @Test
    fun parse_pinkReciclesan_service_prefersFooterSupplierAndNoItems() {
        val lines = listOf(
            line("EMPRESA URDECON", 20, 20, 230, 44, 0),
            line("OBRA JAVALI VIEJO", 20, 48, 260, 72, 0),
            line("ALBARAN 037507", 520, 20, 760, 44, 0),
            line("DESGLOSE JORNADA DE LA MAQUINA", 120, 92, 700, 118, 0),
            line("DESCRIPCION DEL TRABAJO RECOGIDA DE ESCOMBRO", 80, 146, 760, 170, 0),
            line("HORAS TRABAJO 4", 520, 176, 760, 200, 0),
            line("RECICLESAN, SL", 40, 500, 260, 522, 0),
            line("TEL 968589647", 40, 524, 220, 546, 0),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ORIGINAL",
            ocrScore = 61.0,
            ocrConfidence = "medium",
            ocrWarnings = emptyList(),
        )

        assertEquals(ParsedDocType.SERVICE_MACHINERY, result.docType)
        assertTrue(result.supplier?.contains("RECICLESAN") == true)
        assertEquals("037507", result.invoiceNumber)
        assertTrue(result.items.isEmpty())
    }

    @Test
    fun parse_blueTowwers_notMaterials_noInvoiceAndNoItems() {
        val lines = listOf(
            line("PARTE DE TRABAJO", 420, 20, 760, 50, 0),
            line("CONSTRUCCIONES TOWWERS S.L.U.", 20, 54, 420, 82, 0),
            line("POL. IND. LOS VIENTOS 30565", 20, 86, 380, 110, 0),
            line("CLIENTE URDECON S.L", 20, 120, 300, 146, 0),
            line("CANTIDAD CONCEPTO PRECIO IMPORTE", 20, 170, 760, 192, 0, listOf(
                token("CANTIDAD", 20, 170, 140, 192, 0),
                token("CONCEPTO", 210, 170, 332, 192, 0),
                token("PRECIO", 540, 170, 620, 192, 0),
                token("IMPORTE", 680, 170, 760, 192, 0),
            )),
            line("90 ml REMATE ESCUADRA GALVANIZADA", 20, 202, 620, 226, 0, listOf(
                token("90", 20, 202, 50, 226, 0),
                token("ml", 58, 202, 88, 226, 0),
                token("REMATE", 140, 202, 230, 226, 0),
                token("ESCUADRA", 238, 202, 350, 226, 0),
                token("GALVANIZADA", 360, 202, 520, 226, 0),
            )),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ENHANCED_SHARP",
            ocrScore = 56.0,
            ocrConfidence = "low",
            ocrWarnings = listOf("LOW_TEXT"),
        )

        assertTrue(result.docType == ParsedDocType.UNKNOWN || result.docType == ParsedDocType.SERVICE_MACHINERY)
        assertNull(result.invoiceNumber)
        assertTrue(result.items.isEmpty())
    }

    @Test
    fun parse_footerNoise_doesNotAutogenerateItems() {
        val lines = listOf(
            line("OBSERVACIONES", 20, 100, 250, 120, 0, listOf(token("OBSERVACIONES", 20, 100, 250, 120, 0))),
            line("TOTAL 120,00", 20, 130, 220, 150, 0, listOf(token("TOTAL", 20, 130, 90, 150, 0), token("120,00", 120, 130, 220, 150, 0))),
            line("CIF A30032205", 20, 160, 260, 180, 0, listOf(token("CIF", 20, 160, 60, 180, 0), token("A30032205", 90, 160, 260, 180, 0))),
            line("DOMICILIO C/ MAYOR", 20, 190, 320, 210, 0, listOf(token("DOMICILIO", 20, 190, 150, 210, 0), token("C/", 170, 190, 190, 210, 0), token("MAYOR", 200, 190, 260, 210, 0))),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ORIGINAL",
            ocrScore = 35.0,
            ocrConfidence = "low",
            ocrWarnings = emptyList(),
        )

        assertTrue(result.items.isEmpty())
        assertTrue(result.warnings.contains("NO_TABLE_STRONG"))
        assertTrue(result.requiresReview)
    }

    @Test
    fun parse_singleDataRow_isNotStrongTable() {
        val lines = listOf(
            line("ARTICULO DESCRIPCION CANTIDAD PRECIO IMPORTE", 0, 100, 780, 120, 0, listOf(
                token("ARTICULO", 10, 100, 90, 120, 0),
                token("DESCRIPCION", 110, 100, 250, 120, 0),
                token("CANTIDAD", 430, 100, 520, 120, 0),
                token("PRECIO", 590, 100, 660, 120, 0),
                token("IMPORTE", 700, 100, 780, 120, 0),
            )),
            line("VAR919 PALETES 10.00 UN. 2,00 20,00", 0, 130, 780, 148, 0, listOf(
                token("VAR919", 10, 130, 80, 148, 0),
                token("PALETES", 120, 130, 210, 148, 0),
                token("10.00", 440, 130, 500, 148, 0),
                token("UN.", 506, 130, 540, 148, 0),
                token("2,00", 600, 130, 640, 148, 0),
                token("20,00", 708, 130, 760, 148, 0),
            )),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ENHANCED_GRAY",
            ocrScore = 61.0,
            ocrConfidence = "medium",
            ocrWarnings = emptyList(),
        )

        assertTrue(result.items.isEmpty())
        assertTrue(result.warnings.contains("ONLY_ONE_DATA_ROW"))
        assertTrue(result.warnings.contains("NO_TABLE_STRONG"))
    }

    @Test
    fun parse_serviceLayoutHeader_isRejectedAsMaterialsTable() {
        val lines = listOf(
            line("RECICLESAN, SL", 20, 20, 260, 44, 0),
            line("ALBARAN 037507", 520, 20, 760, 44, 0),
            line("DESGLOSE JORNADA DE LA MAQUINA", 120, 90, 700, 118, 0, listOf(
                token("DESGLOSE", 120, 90, 210, 118, 0),
                token("JORNADA", 220, 90, 300, 118, 0),
                token("DE", 308, 90, 330, 118, 0),
                token("LA", 336, 90, 360, 118, 0),
                token("MAQUINA", 368, 90, 470, 118, 0),
            )),
            line("DESCRIPCION DEL TRABAJO HORAS TRABAJO VIAJES TONELADAS M3 TOTAL EUROS", 80, 122, 780, 148, 0, listOf(
                token("DESCRIPCION", 80, 122, 200, 148, 0),
                token("DEL", 206, 122, 240, 148, 0),
                token("TRABAJO", 246, 122, 330, 148, 0),
                token("HORAS", 520, 122, 590, 148, 0),
                token("TRABAJO", 596, 122, 680, 148, 0),
                token("VIAJES", 690, 122, 760, 148, 0),
                token("TONELADAS", 764, 122, 844, 148, 0),
                token("M3", 848, 122, 878, 148, 0),
                token("TOTAL", 884, 122, 940, 148, 0),
                token("EUROS", 946, 122, 1000, 148, 0),
            )),
            line("RECOGIDA DE ESCOMBRO 4 1 25,100", 80, 154, 720, 178, 0, listOf(
                token("RECOGIDA", 80, 154, 170, 178, 0),
                token("DE", 176, 154, 198, 178, 0),
                token("ESCOMBRO", 206, 154, 300, 178, 0),
                token("4", 540, 154, 560, 178, 0),
                token("1", 690, 154, 708, 178, 0),
                token("25,100", 764, 154, 836, 178, 0),
            )),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 1000,
            profileUsed = "ENHANCED_GRAY",
            ocrScore = 62.0,
            ocrConfidence = "medium",
            ocrWarnings = emptyList(),
        )

        assertTrue(result.docType == ParsedDocType.SERVICE_MACHINERY || result.docType == ParsedDocType.UNKNOWN)
        assertTrue(result.items.isEmpty())
        assertTrue(result.warnings.contains("SERVICE_LAYOUT_HEADER") || result.warnings.contains("NO_TABLE_STRONG"))
    }

    @Test
    fun parse_supplierTotal_isRejectedAsProvider() {
        val lines = listOf(
            line("TOTAL", 20, 20, 120, 40, 0),
            line("ALBARAN 12345", 20, 60, 260, 80, 0),
        )

        val result = parser.parse(
            lines = lines,
            tokens = lines.flatMap { it.tokens },
            pageWidth = 800,
            profileUsed = "ORIGINAL",
            ocrScore = 50.0,
            ocrConfidence = "medium",
            ocrWarnings = emptyList(),
        )

        assertNull(result.supplier)
        assertTrue(result.warnings.contains("AMBIGUOUS_PROVIDER"))
    }

    private fun line(
        text: String,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
        page: Int,
        tokens: List<OcrToken> = listOf(token(text, left, top, right, bottom, page)),
    ): OcrLine {
        return OcrLine(
            text = text,
            left = left,
            top = top,
            right = right,
            bottom = bottom,
            page = page,
            tokens = tokens,
        )
    }

    private fun token(
        text: String,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
        page: Int,
    ): OcrToken {
        return OcrToken(
            text = text,
            left = left,
            top = top,
            right = right,
            bottom = bottom,
            page = page,
        )
    }
}
