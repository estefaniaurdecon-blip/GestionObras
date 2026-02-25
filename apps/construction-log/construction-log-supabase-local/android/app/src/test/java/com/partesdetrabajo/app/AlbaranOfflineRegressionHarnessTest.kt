package com.partesdetrabajo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlbaranOfflineRegressionHarnessTest {

    private val dictionaries = AlbaranParserDictionaries(
        fieldSynonyms = mapOf(
            "numeroDocumento" to listOf("ALBARAN", "NRO", "NUMERO", "REF"),
            "proveedor" to listOf("EMPRESA", "PROVEEDOR"),
            "fecha" to listOf("FECHA"),
        ),
        columnSynonyms = mapOf(
            "descripcion" to listOf("ARTICULO", "DESCRIPCION", "CONCEPTO"),
            "cantidad" to listOf("CANTIDAD"),
            "unidad" to listOf("UNIDAD", "UD"),
            "precio" to listOf("PRECIO"),
            "importe" to listOf("IMPORTE", "TOTAL"),
        ),
        docTypeMarkers = mapOf(
            "SERVICE_MACHINERY" to listOf("DESGLOSE JORNADA", "HORAS", "BOMBA", "MAQUINA", "OPERADOR"),
            "MATERIALS" to listOf("ARTICULO", "DESCRIPCION", "CANTIDAD", "PRECIO", "IMPORTE"),
        ),
    )

    private val parser = AlbaranOcrParser(dictionaries)

    private data class FixtureCase(
        val name: String,
        val lines: List<OcrLine>,
        val expectedDocType: ParsedDocType,
        val expectedSupplier: String?,
        val expectedInvoice: String?,
        val expectedDate: String?,
        val minItems: Int,
        val expectNoItems: Boolean = false,
        val expectedWarnings: Set<String> = emptySet(),
        val ocrScore: Double = 70.0,
        val ocrConfidence: String = "medium",
    )

    @Test
    fun offlineRegressionHarness_measuresKeyFieldsAndGuardsBehavior() {
        val fixtures = listOf(
            fixtureMaterialsPage1(),
            fixtureMaterialsRowsOnSecondPage(),
            fixtureService(),
            fixtureMaterialsWithoutPrice(),
        )

        var supplierHits = 0
        var invoiceHits = 0
        var dateHits = 0
        var docTypeHits = 0

        fixtures.forEach { fixture ->
            val tokens = fixture.lines.flatMap { it.tokens }
            val result = parser.parse(
                lines = fixture.lines,
                tokens = tokens,
                pageWidth = 800,
                profileUsed = "ORIGINAL",
                ocrScore = fixture.ocrScore,
                ocrConfidence = fixture.ocrConfidence,
                ocrWarnings = emptyList(),
            )

            if (fixture.expectedSupplier == null || result.supplier == fixture.expectedSupplier) supplierHits += 1
            if (fixture.expectedInvoice == null || result.invoiceNumber == fixture.expectedInvoice) invoiceHits += 1
            if (fixture.expectedDate == null || result.documentDate == fixture.expectedDate) dateHits += 1
            if (result.docType == fixture.expectedDocType) docTypeHits += 1

            assertTrue("${fixture.name}: score fuera de rango ${result.score}", result.score in 0.0..100.0)
            assertEquals("${fixture.name}: docType inesperado", fixture.expectedDocType, result.docType)
            assertTrue(
                "${fixture.name}: items insuficientes (${result.items.size})",
                result.items.size >= fixture.minItems,
            )

            if (fixture.expectNoItems) {
                assertTrue("${fixture.name}: no deberia autocompletar items", result.items.isEmpty())
            }

            fixture.expectedWarnings.forEach { warning ->
                assertTrue("${fixture.name}: falta warning $warning", result.warnings.contains(warning))
            }
        }

        val total = fixtures.size.toDouble()
        val supplierAccuracy = supplierHits / total
        val invoiceAccuracy = invoiceHits / total
        val dateAccuracy = dateHits / total
        val docTypeAccuracy = docTypeHits / total

        assertTrue("supplier accuracy demasiado baja: $supplierAccuracy", supplierAccuracy >= 0.25)
        assertTrue("invoice accuracy demasiado baja: $invoiceAccuracy", invoiceAccuracy >= 0.75)
        assertTrue("date accuracy demasiado baja: $dateAccuracy", dateAccuracy >= 0.50)
        assertTrue("docType accuracy demasiado baja: $docTypeAccuracy", docTypeAccuracy >= 1.0)
    }

    private fun fixtureMaterialsPage1(): FixtureCase {
        val lines = listOf(
            line("EMPRESA: MONTALBAN Y RODRIGUEZ", 0, 20, 760, 40, 0),
            line("ALBARAN 202600200053", 0, 45, 300, 60, 0),
            line("FECHA 07/01/2026", 320, 45, 520, 60, 0),
            line("ARTICULO DESCRIPCION CANTIDAD PRECIO IMPORTE", 0, 100, 780, 120, 0, listOf(
                token("ARTICULO", 10, 100, 90, 120, 0),
                token("DESCRIPCION", 110, 100, 250, 120, 0),
                token("CANTIDAD", 430, 100, 520, 120, 0),
                token("PRECIO", 590, 100, 660, 120, 0),
                token("IMPORTE", 700, 100, 780, 120, 0),
            )),
            line("VAR919 PALETES DE MADERA 60.00 UN. 2,50 150,00", 0, 128, 780, 146, 0, listOf(
                token("VAR919", 10, 128, 80, 146, 0),
                token("PALETES", 120, 128, 190, 146, 0),
                token("DE", 195, 128, 215, 146, 0),
                token("MADERA", 220, 128, 290, 146, 0),
                token("60.00", 440, 128, 500, 146, 0),
                token("UN.", 506, 128, 540, 146, 0),
                token("2,50", 600, 128, 640, 146, 0),
                token("150,00", 708, 128, 768, 146, 0),
            )),
            line("VAR924 PORTE A JAVALI 1.00 UN. 5,00 5,00", 0, 150, 780, 168, 0, listOf(
                token("VAR924", 10, 150, 82, 168, 0),
                token("PORTE", 120, 150, 184, 168, 0),
                token("A", 188, 150, 198, 168, 0),
                token("JAVALI", 204, 150, 274, 168, 0),
                token("1.00", 440, 150, 492, 168, 0),
                token("UN.", 500, 150, 534, 168, 0),
                token("5,00", 600, 150, 640, 168, 0),
                token("5,00", 708, 150, 748, 168, 0),
            )),
        )

        return FixtureCase(
            name = "materials_page_1",
            lines = lines,
            expectedDocType = ParsedDocType.MATERIALS_TABLE,
            expectedSupplier = "MONTALBAN Y RODRIGUEZ",
            expectedInvoice = "202600200053",
            expectedDate = "2026-01-07",
            minItems = 1,
            ocrScore = 80.0,
            ocrConfidence = "high",
        )
    }

    private fun fixtureMaterialsRowsOnSecondPage(): FixtureCase {
        val lines = listOf(
            line("EMPRESA: PREFABRICADOS TORRES", 0, 20, 420, 44, 0),
            line("ALBARAN PRT-20260213", 500, 20, 780, 44, 0),
            line("FECHA 13/02/2026", 500, 46, 780, 66, 0),
            line("ARTICULO DESCRIPCION CANTIDAD PRECIO IMPORTE", 0, 100, 780, 120, 0, listOf(
                token("ARTICULO", 10, 100, 90, 120, 0),
                token("DESCRIPCION", 110, 100, 250, 120, 0),
                token("CANTIDAD", 430, 100, 520, 120, 0),
                token("PRECIO", 590, 100, 660, 120, 0),
                token("IMPORTE", 700, 100, 780, 120, 0),
            )),
            line("BAJ603 BAJANTE 120.00 ML 6,50 780,00", 0, 132, 780, 154, 1, listOf(
                token("BAJ603", 10, 132, 82, 154, 1),
                token("BAJANTE", 110, 132, 190, 154, 1),
                token("120.00", 438, 132, 500, 154, 1),
                token("ML", 506, 132, 540, 154, 1),
                token("6,50", 600, 132, 640, 154, 1),
                token("780,00", 708, 132, 768, 154, 1),
            )),
            line("VAR919 PALETES DE MADERA 60.00 UN 2,50 150,00", 0, 160, 780, 182, 1, listOf(
                token("VAR919", 10, 160, 84, 182, 1),
                token("PALETES", 110, 160, 196, 182, 1),
                token("DE", 202, 160, 220, 182, 1),
                token("MADERA", 224, 160, 300, 182, 1),
                token("60.00", 438, 160, 500, 182, 1),
                token("UN", 506, 160, 534, 182, 1),
                token("2,50", 600, 160, 640, 182, 1),
                token("150,00", 708, 160, 768, 182, 1),
            )),
        )

        return FixtureCase(
            name = "materials_rows_page_2",
            lines = lines,
            expectedDocType = ParsedDocType.MATERIALS_TABLE,
            expectedSupplier = "PREFABRICADOS TORRES",
            expectedInvoice = "PRT-20260213",
            expectedDate = "2026-02-13",
            minItems = 1,
            ocrScore = 72.0,
            ocrConfidence = "medium",
        )
    }

    private fun fixtureService(): FixtureCase {
        val lines = listOf(
            line("EMPRESA RECICLESAN SL", 0, 20, 360, 44, 0),
            line("ALBARAN 037507", 520, 20, 760, 44, 0),
            line("FECHA 16/01/2026", 360, 20, 500, 44, 0),
            line("DESGLOSE JORNADA DE LA MAQUINA", 120, 80, 680, 102, 0),
            line("DESCRIPCION DEL TRABAJO RECOGIDA DE ESCOMBRO", 80, 130, 760, 152, 0),
            line("HORAS TRABAJO 4", 520, 156, 760, 176, 0),
        )

        return FixtureCase(
            name = "service_document",
            lines = lines,
            expectedDocType = ParsedDocType.SERVICE_MACHINERY,
            expectedSupplier = "RECICLESAN SL",
            expectedInvoice = "037507",
            expectedDate = "2026-01-16",
            minItems = 0,
            expectNoItems = true,
            expectedWarnings = setOf("NO_TABLE"),
            ocrScore = 68.0,
            ocrConfidence = "medium",
        )
    }

    private fun fixtureMaterialsWithoutPrice(): FixtureCase {
        val lines = listOf(
            line("EMPRESA TOWWERS S.L.U.", 0, 20, 360, 44, 0),
            line("ALBARAN 2025/12", 520, 20, 760, 44, 0),
            line("CANTIDAD CONCEPTO", 20, 100, 420, 122, 0, listOf(
                token("CANTIDAD", 20, 100, 140, 122, 0),
                token("CONCEPTO", 170, 100, 300, 122, 0),
            )),
            line("90 ml REMATE ESCUADRA GALVANIZADA", 20, 132, 760, 156, 0, listOf(
                token("90", 20, 132, 52, 156, 0),
                token("ml", 58, 132, 90, 156, 0),
                token("REMATE", 130, 132, 240, 156, 0),
                token("ESCUADRA", 250, 132, 380, 156, 0),
                token("GALVANIZADA", 390, 132, 560, 156, 0),
            )),
            line("15 ud FIJACION", 20, 160, 760, 180, 0, listOf(
                token("15", 20, 160, 46, 180, 0),
                token("ud", 52, 160, 84, 180, 0),
                token("FIJACION", 130, 160, 248, 180, 0),
            )),
        )

        return FixtureCase(
            name = "materials_no_price",
            lines = lines,
            expectedDocType = ParsedDocType.UNKNOWN,
            expectedSupplier = "TOWWERS S.L.U.",
            expectedInvoice = "2025/12",
            expectedDate = null,
            minItems = 0,
            expectNoItems = true,
            expectedWarnings = setOf("NO_TABLE_STRONG"),
            ocrScore = 62.0,
            ocrConfidence = "medium",
        )
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
