package com.partesdetrabajo.app

import android.app.Activity
import android.content.Intent
import android.content.IntentSender
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

data class ScanCaptureResult(
    val imageUris: List<Uri>,
    val pdfUri: Uri?,
)

data class UploadDocument(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String,
)

class AlbaranScanController(
    private val activity: Activity,
) {
    companion object {
        private const val TARGET_UPLOAD_LONG_SIDE_PX = 2048
        private const val JPEG_QUALITY = 84
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

        if (capture.imageUris.isEmpty()) return null

        if (capture.imageUris.size == 1) {
            return buildJpegUpload(capture.imageUris.firstOrNull())
        }

        val mergedPdf = buildPdfFromImages(capture.imageUris)
        if (mergedPdf != null && mergedPdf.isNotEmpty()) {
            return UploadDocument(
                bytes = mergedPdf,
                fileName = "albaran-${System.currentTimeMillis()}.pdf",
                mimeType = "application/pdf",
            )
        }

        return buildJpegUpload(capture.imageUris.firstOrNull())
    }

    private fun buildJpegUpload(uri: Uri?): UploadDocument? {
        uri ?: return null
        val bitmap = decodeBitmapForUpload(uri) ?: return null
        return try {
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)
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

    private fun buildPdfFromImages(imageUris: List<Uri>): ByteArray? {
        val document = PdfDocument()
        var pageCount = 0

        try {
            imageUris.forEach { imageUri ->
                val bitmap = decodeBitmapForUpload(imageUri) ?: return@forEach
                try {
                    val pageInfo = PdfDocument.PageInfo.Builder(bitmap.width, bitmap.height, pageCount + 1).create()
                    val page = document.startPage(pageInfo)
                    try {
                        val canvas: Canvas = page.canvas
                        canvas.drawColor(Color.WHITE)
                        canvas.drawBitmap(bitmap, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG))
                    } finally {
                        document.finishPage(page)
                    }
                    pageCount += 1
                } finally {
                    if (!bitmap.isRecycled) {
                        bitmap.recycle()
                    }
                }
            }

            if (pageCount == 0) return null

            val output = ByteArrayOutputStream()
            document.writeTo(output)
            return output.toByteArray()
        } catch (_: Exception) {
            return null
        } finally {
            document.close()
        }
    }

    private fun decodeBitmapForUpload(uri: Uri): Bitmap? {
        val resolver = activity.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val maxSide = max(bounds.outWidth, bounds.outHeight)
        var inSampleSize = 1
        while ((maxSide / inSampleSize) > TARGET_UPLOAD_LONG_SIDE_PX * 1.2f) {
            inSampleSize *= 2
        }

        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            this.inSampleSize = inSampleSize
        }

        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        val oriented = applyExifOrientationIfNeeded(uri, decoded)
        return downscale(oriented, TARGET_UPLOAD_LONG_SIDE_PX)
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

    private fun downscale(bitmap: Bitmap, maxSidePx: Int): Bitmap {
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
}
