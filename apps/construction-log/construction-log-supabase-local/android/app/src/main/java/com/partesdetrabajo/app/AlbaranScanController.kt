package com.partesdetrabajo.app

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognizer
import kotlin.math.max

data class OcrAggregateResult(
    val lines: List<OcrLine>,
    val tokens: List<OcrToken>,
    val pageWidth: Int,
    val imageUris: List<Uri>,
)

class AlbaranScanController(
    private val activity: Activity,
) {
    private val scannerOptions = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(6)
        .setResultFormats(
            GmsDocumentScannerOptions.RESULT_FORMAT_JPEG,
            GmsDocumentScannerOptions.RESULT_FORMAT_PDF,
        )
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build()

    private val scannerClient = GmsDocumentScanning.getClient(scannerOptions)

    fun requestStartIntentSender(
        onSuccess: (IntentSender) -> Unit,
        onError: (Exception) -> Unit,
    ) {
        scannerClient.getStartScanIntent(activity)
            .addOnSuccessListener { intentSender -> onSuccess(intentSender) }
            .addOnFailureListener { error -> onError(error) }
    }

    fun extractImageUris(resultData: Intent?): List<Uri> {
        val result = GmsDocumentScanningResult.fromActivityResultIntent(resultData) ?: return emptyList()
        val pages = result.pages ?: emptyList()
        return pages.mapNotNull { page -> page.imageUri }
    }

    fun runOcr(
        imageUris: List<Uri>,
        textRecognizer: TextRecognizer,
    ): OcrAggregateResult {
        val allLines = mutableListOf<OcrLine>()
        val allTokens = mutableListOf<OcrToken>()
        var maxPageWidth = 0

        imageUris.forEachIndexed { pageIndex, imageUri ->
            val image = InputImage.fromFilePath(activity, imageUri)
            maxPageWidth = max(maxPageWidth, image.width)
            val recognized = Tasks.await(textRecognizer.process(image))
            collectLinesAndTokens(
                page = pageIndex,
                text = recognized,
                lines = allLines,
                tokens = allTokens,
            )
        }

        return OcrAggregateResult(
            lines = allLines,
            tokens = allTokens,
            pageWidth = max(maxPageWidth, 1),
            imageUris = imageUris,
        )
    }

    private fun collectLinesAndTokens(
        page: Int,
        text: Text,
        lines: MutableList<OcrLine>,
        tokens: MutableList<OcrToken>,
    ) {
        for (block in text.textBlocks) {
            for (line in block.lines) {
                val lineTokens = line.elements.mapNotNull { element ->
                    val bounds = element.boundingBox ?: return@mapNotNull null
                    OcrToken(
                        text = element.text,
                        left = bounds.left,
                        top = bounds.top,
                        right = bounds.right,
                        bottom = bounds.bottom,
                        page = page,
                    )
                }

                if (lineTokens.isEmpty()) continue
                tokens.addAll(lineTokens)

                val lineBounds = line.boundingBox
                val bounds = if (lineBounds != null) {
                    intArrayOf(lineBounds.left, lineBounds.top, lineBounds.right, lineBounds.bottom)
                } else {
                    computeBounds(lineTokens) ?: continue
                }

                lines.add(
                    OcrLine(
                        text = line.text.trim(),
                        left = bounds[0],
                        top = bounds[1],
                        right = bounds[2],
                        bottom = bounds[3],
                        page = page,
                        tokens = lineTokens.sortedBy { token -> token.left },
                    ),
                )
            }
        }
    }

    private fun computeBounds(tokens: List<OcrToken>): IntArray? {
        if (tokens.isEmpty()) return null
        var left = Int.MAX_VALUE
        var top = Int.MAX_VALUE
        var right = Int.MIN_VALUE
        var bottom = Int.MIN_VALUE

        tokens.forEach { token ->
            left = minOf(left, token.left)
            top = minOf(top, token.top)
            right = maxOf(right, token.right)
            bottom = maxOf(bottom, token.bottom)
        }

        if (left == Int.MAX_VALUE || top == Int.MAX_VALUE || right == Int.MIN_VALUE || bottom == Int.MIN_VALUE) {
            return null
        }
        return intArrayOf(left, top, right, bottom)
    }
}
