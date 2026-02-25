package com.partesdetrabajo.app

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognizer
import java.io.ByteArrayOutputStream
import java.text.Normalizer
import kotlin.math.max
import kotlin.math.roundToInt

data class OcrAggregateResult(
    val lines: List<OcrLine>,
    val tokens: List<OcrToken>,
    val pageWidth: Int,
    val imageUris: List<Uri>,
    val rawText: String,
    val ocrLinePreviews: List<OcrLine>,
    val profileUsed: String,
    val score: Double,
    val confidence: String,
    val warnings: List<String>,
)

data class ScanCaptureResult(
    val imageUris: List<Uri>,
    val pdfUri: Uri?,
)

data class UploadDocument(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String,
)

private enum class OcrProfile {
    ORIGINAL,
    ENHANCED_GRAY,
    ENHANCED_SHARP,
}

private data class OcrProfileResult(
    val profile: OcrProfile,
    val lines: MutableList<OcrLine> = mutableListOf(),
    val tokens: MutableList<OcrToken> = mutableListOf(),
    val pageRawText: MutableList<String> = mutableListOf(),
    var pageWidth: Int = 1,
    var blocksCount: Int = 0,
    var linesCount: Int = 0,
    var elementsCount: Int = 0,
    var score: Int = 0,
    val pageScores: MutableList<Int> = mutableListOf(),
    val pageWeights: MutableList<Double> = mutableListOf(),
    val warnings: MutableSet<String> = linkedSetOf(),
)

private data class OcrScoreEvaluation(
    val score: Int,
    val warnings: Set<String>,
)

private data class DecodedPage(
    val pageIndex: Int,
    val bitmap: Bitmap,
    val imageWarnings: Set<String>,
)

class AlbaranScanController(
    private val activity: Activity,
) {
    companion object {
        private const val TAG = "ALBARAN_OCR"
        private const val TARGET_LONG_SIDE_PX = 2000
        private const val OCR_SCORE_THRESHOLD_OK = 65
        private const val CONTRAST_FACTOR = 1.3f
    }

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

    fun extractScanCapture(resultData: Intent?): ScanCaptureResult {
        val result = GmsDocumentScanningResult.fromActivityResultIntent(resultData)
            ?: return ScanCaptureResult(emptyList(), null)
        val pages = result.pages ?: emptyList()
        val imageUris = pages.mapNotNull { page -> page.imageUri }
        val pdfUri = result.pdf?.uri
        return ScanCaptureResult(imageUris = imageUris, pdfUri = pdfUri)
    }

    fun extractImageUris(resultData: Intent?): List<Uri> = extractScanCapture(resultData).imageUris

    fun buildUploadDocument(capture: ScanCaptureResult): UploadDocument? {
        capture.pdfUri?.let { pdfUri ->
            val pdfBytes = readBytes(pdfUri)
            if (pdfBytes.isNotEmpty()) {
                return UploadDocument(
                    bytes = pdfBytes,
                    fileName = "albaran-${System.currentTimeMillis()}.pdf",
                    mimeType = "application/pdf",
                )
            }
        }

        val firstImageUri = capture.imageUris.firstOrNull() ?: return null
        val bitmap = decodeBitmapForUpload(firstImageUri) ?: return null
        return try {
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output)
            UploadDocument(
                bytes = output.toByteArray(),
                fileName = "albaran-${System.currentTimeMillis()}.jpg",
                mimeType = "image/jpeg",
            )
        } finally {
            if (!bitmap.isRecycled) {
                bitmap.recycle()
            }
        }
    }

    fun runOcr(
        imageUris: List<Uri>,
        textRecognizer: TextRecognizer,
    ): OcrAggregateResult {
        val decodedPages = decodePages(imageUris)
        if (decodedPages.isEmpty()) {
            return OcrAggregateResult(
                lines = emptyList(),
                tokens = emptyList(),
                pageWidth = 1,
                imageUris = imageUris,
                rawText = "",
                ocrLinePreviews = emptyList(),
                profileUsed = OcrProfile.ORIGINAL.name,
                score = 0.0,
                confidence = "low",
                warnings = listOf("LOW_TEXT"),
            )
        }

        return try {
            val original = runProfileOcr(
                pages = decodedPages,
                textRecognizer = textRecognizer,
                profile = OcrProfile.ORIGINAL,
                includeImageWarnings = true,
            )
            if (original.score >= OCR_SCORE_THRESHOLD_OK) {
                Log.i(TAG, "profileSelect selected=${original.profile.name} originalScore=${original.score}")
                return toAggregateResult(original, imageUris)
            }

            val gray = runProfileOcr(
                pages = decodedPages,
                textRecognizer = textRecognizer,
                profile = OcrProfile.ENHANCED_GRAY,
                includeImageWarnings = false,
            )
            if (gray.score >= OCR_SCORE_THRESHOLD_OK) {
                val extraWarnings = original.warnings.filter { it == "GLARE" || it == "LOW_CONTRAST" || it == "BLUR" }.toSet()
                Log.i(
                    TAG,
                    "profileSelect selected=${gray.profile.name} originalScore=${original.score} grayScore=${gray.score}",
                )
                return toAggregateResult(gray, imageUris, extraWarnings)
            }

            val sharp = runProfileOcr(
                pages = decodedPages,
                textRecognizer = textRecognizer,
                profile = OcrProfile.ENHANCED_SHARP,
                includeImageWarnings = false,
            )

            val best = listOf(original, gray, sharp).maxWithOrNull(
                compareBy<OcrProfileResult> { it.score }
                    .thenBy { it.elementsCount }
                    .thenBy { it.linesCount },
            ) ?: original
            val extraWarnings = original.warnings.filter { it == "GLARE" || it == "LOW_CONTRAST" || it == "BLUR" }.toSet()
            Log.i(
                TAG,
                "profileSelect selected=${best.profile.name} originalScore=${original.score} grayScore=${gray.score} sharpScore=${sharp.score}",
            )
            toAggregateResult(best, imageUris, extraWarnings)
        } finally {
            decodedPages.forEach { page ->
                if (!page.bitmap.isRecycled) {
                    page.bitmap.recycle()
                }
            }
        }
    }

    private fun runProfileOcr(
        pages: List<DecodedPage>,
        textRecognizer: TextRecognizer,
        profile: OcrProfile,
        includeImageWarnings: Boolean,
    ): OcrProfileResult {
        val result = OcrProfileResult(profile = profile)

        pages.forEach { page ->
            val sourceBitmap = page.bitmap
            if (includeImageWarnings) {
                result.warnings.addAll(page.imageWarnings)
            }

            val bitmapForProfile = buildBitmapForProfile(sourceBitmap, profile)

            try {
                val image = InputImage.fromBitmap(bitmapForProfile, 0)
                val recognized = Tasks.await(textRecognizer.process(image))
                result.pageWidth = max(result.pageWidth, image.width)
                result.pageRawText.add(recognized.text)

                collectLinesAndTokens(
                    page = page.pageIndex,
                    text = recognized,
                    lines = result.lines,
                    tokens = result.tokens,
                )

                val pageBlocks = recognized.textBlocks.size
                val pageLines = recognized.textBlocks.sumOf { block -> block.lines.size }
                val pageElements = recognized.textBlocks.sumOf { block -> block.lines.sumOf { line -> line.elements.size } }
                result.blocksCount += pageBlocks
                result.linesCount += pageLines
                result.elementsCount += pageElements

                val evaluation = scoreFromOcr(
                    rawText = recognized.text,
                    blocksCount = pageBlocks,
                    linesCount = pageLines,
                    elementsCount = pageElements,
                )
                result.pageScores.add(evaluation.score)
                result.pageWeights.add(computePageWeight(pageLines, pageElements, recognized.text))
                result.warnings.addAll(evaluation.warnings)

                Log.d(
                    TAG,
                    "profile=${profile.name} page=${page.pageIndex} textLen=${recognized.text.length} " +
                        "blocks=$pageBlocks lines=$pageLines elements=$pageElements score=${evaluation.score} " +
                        "tokens=${result.tokens.size} warnings=${evaluation.warnings.joinToString(",")}",
                )
            } finally {
                if (bitmapForProfile !== sourceBitmap) {
                    bitmapForProfile.recycle()
                }
            }
        }

        result.score = when {
            result.pageScores.isEmpty() -> 0
            else -> weightedAverageScore(result.pageScores, result.pageWeights)
        }

        if (result.tokens.size < 18 || result.lines.size < 4) {
            result.warnings.add("LOW_TEXT")
        }

        Log.i(
            TAG,
            "profile=${profile.name} summary score=${result.score} lines=${result.lines.size} " +
                "tokens=${result.tokens.size} warnings=${result.warnings.joinToString(",")}",
        )

        return result
    }

    private fun toAggregateResult(
        profileResult: OcrProfileResult,
        imageUris: List<Uri>,
        extraWarnings: Set<String> = emptySet(),
    ): OcrAggregateResult {
        val warnings = linkedSetOf<String>()
        warnings.addAll(extraWarnings)
        warnings.addAll(profileResult.warnings)
        if (profileResult.tokens.size < 18 || profileResult.lines.size < 4) {
            warnings.add("LOW_TEXT")
        }

        val rawText = profileResult.pageRawText
            .map { text -> text.trim() }
            .filter { text -> text.isNotBlank() }
            .joinToString("\n\n--- PAGE ---\n\n")
        val previewLines = profileResult.lines.take(260)

        return OcrAggregateResult(
            lines = profileResult.lines,
            tokens = profileResult.tokens,
            pageWidth = max(profileResult.pageWidth, 1),
            imageUris = imageUris,
            rawText = rawText,
            ocrLinePreviews = previewLines,
            profileUsed = profileResult.profile.name,
            score = profileResult.score.toDouble(),
            confidence = inferConfidence(profileResult.score, warnings),
            warnings = warnings.toList(),
        )
    }

    private fun weightedAverageScore(scores: List<Int>, weights: List<Double>): Int {
        if (scores.isEmpty()) return 0
        if (scores.size != weights.size || weights.isEmpty()) {
            return scores.average().roundToInt().coerceIn(0, 100)
        }

        var weightedSum = 0.0
        var totalWeight = 0.0
        scores.indices.forEach { index ->
            val weight = weights[index].coerceAtLeast(0.05)
            weightedSum += scores[index] * weight
            totalWeight += weight
        }

        if (totalWeight <= 0.0) return scores.average().roundToInt().coerceIn(0, 100)
        return (weightedSum / totalWeight).roundToInt().coerceIn(0, 100)
    }

    private fun computePageWeight(linesCount: Int, elementsCount: Int, rawText: String): Double {
        val denseChars = rawText.count { !it.isWhitespace() }
        val structureSignal = (linesCount * 1.5) + (elementsCount * 0.3) + (denseChars / 40.0)
        return structureSignal.coerceIn(0.25, 20.0)
    }

    private fun buildBitmapForProfile(source: Bitmap, profile: OcrProfile): Bitmap {
        return when (profile) {
            OcrProfile.ORIGINAL -> source
            OcrProfile.ENHANCED_GRAY -> {
                val gray = toGrayscale(source)
                val contrasted = increaseContrast(gray, CONTRAST_FACTOR)
                gray.recycle()
                contrasted
            }

            OcrProfile.ENHANCED_SHARP -> {
                val gray = toGrayscale(source)
                val contrasted = increaseContrast(gray, CONTRAST_FACTOR)
                gray.recycle()
                val sharpened = sharpen(contrasted)
                contrasted.recycle()
                sharpened
            }
        }
    }

    private fun collectLinesAndTokens(
        page: Int,
        text: Text,
        lines: MutableList<OcrLine>,
        tokens: MutableList<OcrToken>,
    ) {
        for (block in text.textBlocks) {
            val blockBounds = block.boundingBox
            for (line in block.lines) {
                val lineBounds = line.boundingBox ?: blockBounds
                val lineText = line.text.trim()

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
                }.toMutableList()

                // Some devices return line text but missing element-level boxes.
                // Fallback: split the line box into synthetic word boxes so parser still works.
                if (lineTokens.isEmpty() && lineText.isNotBlank() && lineBounds != null) {
                    lineTokens.addAll(buildSyntheticTokensForLine(lineText, lineBounds, page))
                }

                if (lineTokens.isEmpty()) continue
                tokens.addAll(lineTokens)

                val resolvedLineText = lineText.ifBlank {
                    lineTokens
                        .map { token -> token.text.trim() }
                        .filter { token -> token.isNotBlank() }
                        .joinToString(" ")
                        .trim()
                }
                if (resolvedLineText.isBlank()) continue

                val bounds = if (lineBounds != null) {
                    intArrayOf(lineBounds.left, lineBounds.top, lineBounds.right, lineBounds.bottom)
                } else {
                    computeBounds(lineTokens) ?: continue
                }

                lines.add(
                    OcrLine(
                        text = resolvedLineText,
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

    private fun buildSyntheticTokensForLine(
        lineText: String,
        bounds: Rect,
        page: Int,
    ): List<OcrToken> {
        val words = lineText.split(Regex("\\s+")).filter { it.isNotBlank() }
        if (words.isEmpty()) return emptyList()

        val totalWidth = (bounds.right - bounds.left).coerceAtLeast(words.size)
        val step = totalWidth.toFloat() / words.size.toFloat()
        val out = mutableListOf<OcrToken>()

        words.forEachIndexed { index, word ->
            val left = (bounds.left + (step * index)).toInt()
            val right = if (index == words.lastIndex) {
                bounds.right
            } else {
                (bounds.left + (step * (index + 1))).toInt().coerceAtLeast(left + 1)
            }
            out.add(
                OcrToken(
                    text = word,
                    left = left,
                    top = bounds.top,
                    right = right,
                    bottom = bounds.bottom,
                    page = page,
                ),
            )
        }

        return out
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

    private fun decodePages(imageUris: List<Uri>): List<DecodedPage> {
        val pages = mutableListOf<DecodedPage>()
        imageUris.forEachIndexed { index, uri ->
            val bitmap = decodeBitmapForOcr(uri)
            if (bitmap == null) return@forEachIndexed
            pages.add(
                DecodedPage(
                    pageIndex = index,
                    bitmap = bitmap,
                    imageWarnings = computeImageWarnings(bitmap),
                ),
            )
        }
        return pages
    }

    private fun decodeBitmapForOcr(uri: Uri): Bitmap? {
        val resolver = activity.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val maxSide = max(bounds.outWidth, bounds.outHeight)
        var inSampleSize = 1
        while ((maxSide / inSampleSize) > TARGET_LONG_SIDE_PX * 1.2f) {
            inSampleSize *= 2
        }

        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            this.inSampleSize = inSampleSize
        }

        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        return downscale(decoded, TARGET_LONG_SIDE_PX)
    }

    private fun decodeBitmapForUpload(uri: Uri): Bitmap? {
        val resolver = activity.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val maxUploadLongSide = 2048
        val maxSide = max(bounds.outWidth, bounds.outHeight)
        var inSampleSize = 1
        while ((maxSide / inSampleSize) > maxUploadLongSide * 1.2f) {
            inSampleSize *= 2
        }

        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            this.inSampleSize = inSampleSize
        }

        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        val oriented = applyExifOrientationIfNeeded(uri, decoded)
        return downscale(oriented, maxUploadLongSide)
    }

    private fun applyExifOrientationIfNeeded(uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = readExifOrientation(uri)
        if (orientation == ExifInterface.ORIENTATION_NORMAL || orientation == ExifInterface.ORIENTATION_UNDEFINED) {
            return bitmap
        }

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.preScale(-1f, 1f)
                matrix.postRotate(270f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.preScale(-1f, 1f)
                matrix.postRotate(90f)
            }
            else -> return bitmap
        }

        return try {
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated !== bitmap) {
                bitmap.recycle()
            }
            rotated
        } catch (_: Exception) {
            bitmap
        }
    }

    private fun readExifOrientation(uri: Uri): Int {
        return runCatching {
            activity.contentResolver.openInputStream(uri)?.use { input ->
                ExifInterface(input).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            } ?: ExifInterface.ORIENTATION_NORMAL
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    }

    private fun readBytes(uri: Uri): ByteArray {
        return runCatching {
            activity.contentResolver.openInputStream(uri)?.use { stream ->
                stream.readBytes()
            } ?: ByteArray(0)
        }.getOrDefault(ByteArray(0))
    }

    private fun downscale(bitmap: Bitmap, maxSidePx: Int = TARGET_LONG_SIDE_PX): Bitmap {
        val longSide = max(bitmap.width, bitmap.height)
        if (longSide <= maxSidePx) return bitmap

        val scale = maxSidePx.toFloat() / longSide.toFloat()
        val scaledWidth = (bitmap.width * scale).roundToInt().coerceAtLeast(1)
        val scaledHeight = (bitmap.height * scale).roundToInt().coerceAtLeast(1)
        val scaled = Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)
        if (scaled !== bitmap) {
            bitmap.recycle()
        }
        return scaled
    }

    private fun toGrayscale(bitmap: Bitmap): Bitmap {
        val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val matrix = ColorMatrix().apply { setSaturation(0f) }
        paint.colorFilter = ColorMatrixColorFilter(matrix)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)
        return output
    }

    private fun increaseContrast(bitmap: Bitmap, factor: Float = CONTRAST_FACTOR): Bitmap {
        val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val contrast = factor.coerceIn(1.1f, 1.6f)
        val translate = (-0.5f * contrast + 0.5f) * 255f
        val matrix = ColorMatrix(
            floatArrayOf(
                contrast, 0f, 0f, 0f, translate,
                0f, contrast, 0f, 0f, translate,
                0f, 0f, contrast, 0f, translate,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        paint.colorFilter = ColorMatrixColorFilter(matrix)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)
        return output
    }

    private fun sharpen(bitmap: Bitmap): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        if (width < 3 || height < 3) return bitmap.copy(Bitmap.Config.ARGB_8888, false)

        val src = IntArray(width * height)
        val dst = IntArray(width * height)
        bitmap.getPixels(src, 0, width, 0, 0, width, height)
        val kernel = floatArrayOf(
            0f, -0.35f, 0f,
            -0.35f, 2.4f, -0.35f,
            0f, -0.35f, 0f,
        )

        for (y in 0 until height) {
            for (x in 0 until width) {
                val index = y * width + x
                if (x == 0 || y == 0 || x == width - 1 || y == height - 1) {
                    dst[index] = src[index]
                    continue
                }

                var r = 0f
                var g = 0f
                var b = 0f
                var kernelIndex = 0
                for (ky in -1..1) {
                    for (kx in -1..1) {
                        val pixel = src[(y + ky) * width + (x + kx)]
                        val weight = kernel[kernelIndex++]
                        r += ((pixel shr 16) and 0xFF) * weight
                        g += ((pixel shr 8) and 0xFF) * weight
                        b += (pixel and 0xFF) * weight
                    }
                }

                val alpha = (src[index] ushr 24) and 0xFF
                val rr = clampColor(r)
                val gg = clampColor(g)
                val bb = clampColor(b)
                dst[index] = (alpha shl 24) or (rr shl 16) or (gg shl 8) or bb
            }
        }

        return Bitmap.createBitmap(dst, width, height, Bitmap.Config.ARGB_8888)
    }

    private fun clampColor(value: Float): Int {
        return value.roundToInt().coerceIn(0, 255)
    }

    private fun computeImageWarnings(bitmap: Bitmap): Set<String> {
        val warnings = linkedSetOf<String>()
        val width = bitmap.width
        val height = bitmap.height
        if (width <= 0 || height <= 0) return warnings

        val stepX = (width / 80).coerceAtLeast(1)
        val stepY = (height / 80).coerceAtLeast(1)
        var count = 0
        var bright = 0
        var dark = 0
        var sum = 0.0
        var sumSq = 0.0
        var edges = 0.0
        var edgeCount = 0

        fun lumAt(x: Int, y: Int): Int {
            val c = bitmap.getPixel(x, y)
            return (Color.red(c) * 0.299 + Color.green(c) * 0.587 + Color.blue(c) * 0.114).roundToInt()
        }

        var y = 0
        while (y < height) {
            var x = 0
            while (x < width) {
                val lum = lumAt(x, y)
                sum += lum
                sumSq += lum * lum
                count += 1
                if (lum >= 238) bright += 1
                if (lum <= 24) dark += 1

                if (x + stepX < width && y + stepY < height) {
                    val right = lumAt(x + stepX, y)
                    val down = lumAt(x, y + stepY)
                    edges += kotlin.math.abs(lum - right) + kotlin.math.abs(lum - down)
                    edgeCount += 2
                }
                x += stepX
            }
            y += stepY
        }

        if (count == 0) return warnings
        val mean = sum / count
        val variance = (sumSq / count) - (mean * mean)
        val brightRatio = bright.toDouble() / count.toDouble()
        val darkRatio = dark.toDouble() / count.toDouble()
        val edgeMean = if (edgeCount > 0) edges / edgeCount.toDouble() else 0.0

        if (brightRatio > 0.33 && darkRatio < 0.03) {
            warnings.add("GLARE")
        }
        if (variance < 420.0) {
            warnings.add("LOW_CONTRAST")
        }
        if (edgeMean < 7.5) {
            warnings.add("BLUR")
        }

        return warnings
    }

    private fun scoreFromOcr(
        rawText: String,
        blocksCount: Int,
        linesCount: Int,
        elementsCount: Int,
    ): OcrScoreEvaluation {
        val normalized = normalizeForPatterns(rawText)
        if (normalized.isBlank()) return OcrScoreEvaluation(0, setOf("LOW_TEXT"))

        val warnings = linkedSetOf<String>()
        val tokens = normalized.split(" ").filter { it.isNotBlank() }
        val oneCharTokens = tokens.count { it.length == 1 }
        val oneCharRatio = if (tokens.isNotEmpty()) oneCharTokens.toDouble() / tokens.size.toDouble() else 1.0

        val compactLength = rawText.replace(Regex("\\s+"), "").length
        if (compactLength < 40 || linesCount < 3 || elementsCount < 25) {
            warnings.add("LOW_TEXT")
        }

        val hasDate = Regex("\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b").containsMatchIn(normalized)
        val hasDocLabel = Regex("\\b(ALBARAN|NUMERO|REF|NOTA DE ENTREGA|DELIVERY NOTE)\\b").containsMatchIn(normalized)
        val hasPlausibleDocId = Regex("\\b[A-Z0-9]{1,4}[/-][A-Z0-9/-]{2,}\\b").containsMatchIn(normalized) ||
            Regex("\\b\\d{4,10}\\b").containsMatchIn(normalized)
        val hasDocumentNumber = hasDocLabel || hasPlausibleDocId

        val decimalRegex = Regex("\\b\\d+[.,]\\d{2}\\b")
        val decimalHits = decimalRegex.findAll(normalized).count()
        val hasDecimal = decimalHits > 0

        val tableHeaderHits = Regex("\\b(CANTIDAD|IMPORTE|PRECIO|ARTICULO|DESCRIPCION|CONCEPTO|MATERIAL|TOTAL)\\b")
            .findAll(normalized)
            .count()
        val hasTableEvidence = tableHeaderHits >= 2

        val patternsDetected = listOf(hasDate, hasDocumentNumber, hasDecimal, hasTableEvidence).count { it }
        val baseScore = (elementsCount / 10).coerceAtMost(40) + (linesCount / 5).coerceAtMost(20)
        var score = baseScore + (patternsDetected * 10) + (blocksCount / 2).coerceAtMost(10)

        val nonWhitespace = rawText.filterNot { it.isWhitespace() }
        val rareChars = nonWhitespace.count { char ->
            !char.isLetterOrDigit() && !".,:;/#%+-()[]".contains(char)
        }
        val rareCharRatio = if (nonWhitespace.isNotEmpty()) {
            rareChars.toDouble() / nonWhitespace.length.toDouble()
        } else {
            1.0
        }

        if (oneCharRatio > 0.35) score -= 10
        if (rareCharRatio > 0.13) score -= 10
        if (warnings.contains("LOW_TEXT")) score -= 10

        val commaCount = normalized.count { it == ',' }
        val dotCount = normalized.count { it == '.' }
        if (commaCount >= 3 && dotCount >= 3 && decimalHits < 2) {
            warnings.add("DECIMAL_AMBIGUITY")
            score -= 6
        }

        val handwritingLowConfidence =
            (oneCharRatio > 0.42 && patternsDetected <= 1) ||
                ((linesCount <= 3 || elementsCount < 25) && patternsDetected == 0)
        if (handwritingLowConfidence) {
            warnings.add("HANDWRITING_LOW_CONFIDENCE")
            score -= 10
        }

        if (score <= 35 && tokens.size < 20) {
            warnings.add("LOW_TEXT")
        }

        return OcrScoreEvaluation(score = score.coerceIn(0, 100), warnings = warnings)
    }

    private fun inferConfidence(score: Int, warnings: Set<String>): String {
        if (warnings.contains("LOW_TEXT")) return "low"
        if (warnings.contains("HANDWRITING_LOW_CONFIDENCE")) {
            return if (score >= 70) "medium" else "low"
        }
        if (score >= 80) return "high"
        if (score >= 55) return "medium"
        return "low"
    }
    private fun normalizeForPatterns(value: String): String {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .uppercase()
            // Accept common OCR forms for N°/Nº and mojibake variants.
            .replace(Regex("\\bN\\s*[\\u00BA\\u00B0]\\s*"), " NUMERO ")
            .replace(Regex("\\bNA\\s*[\\u00BA\\u00B0]\\s*"), " NUMERO ")
            .replace(Regex("\\bNO\\.?\\b"), " NUMERO ")
            .replace(Regex("[^A-Z0-9/., -]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}


