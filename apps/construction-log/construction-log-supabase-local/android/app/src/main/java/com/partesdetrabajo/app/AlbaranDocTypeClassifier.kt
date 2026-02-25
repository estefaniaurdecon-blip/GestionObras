package com.partesdetrabajo.app

import android.content.Context
import android.util.Log
import org.tensorflow.lite.task.text.nlclassifier.NLClassifier

data class DocTypeModelPrediction(
    val docType: ParsedDocType,
    val confidence: Double,
    val rankedLabels: List<Pair<String, Double>>,
)

interface AlbaranDocTypeClassifier {
    fun predict(normalizedText: String): DocTypeModelPrediction?
}

class TfliteAlbaranDocTypeClassifier(
    context: Context,
) : AlbaranDocTypeClassifier {
    companion object {
        private const val TAG = "ALBARAN_OCR"
        private const val MODEL_DIR = "albaran_parser"
        private const val MODEL_FILE = "doc_type_classifier.tflite"
        private const val MODEL_ASSET_PATH = "$MODEL_DIR/$MODEL_FILE"
        private const val MIN_INPUT_CHARS = 28
        private const val MAX_INPUT_CHARS = 3200
    }

    private val classifier: NLClassifier? = run {
        val modelExists = runCatching {
            context.assets.list(MODEL_DIR)?.any { entry -> entry.equals(MODEL_FILE, ignoreCase = true) } == true
        }.getOrDefault(false)

        if (!modelExists) {
            Log.i(TAG, "DocType TFLite model not found at $MODEL_ASSET_PATH. Using heuristic parser fallback.")
            null
        } else {
            runCatching { NLClassifier.createFromFile(context, MODEL_ASSET_PATH) }
                .onFailure { error ->
                    Log.w(TAG, "Unable to load DocType TFLite model. Heuristic fallback will be used.", error)
                }
                .getOrNull()
        }
    }

    override fun predict(normalizedText: String): DocTypeModelPrediction? {
        val localClassifier = classifier ?: return null
        val text = normalizedText
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(MAX_INPUT_CHARS)
        if (text.length < MIN_INPUT_CHARS) return null

        val categories = runCatching { localClassifier.classify(text) }
            .onFailure { error ->
                Log.w(TAG, "TFLite docType inference failed. Falling back to heuristics.", error)
            }
            .getOrNull()
            .orEmpty()
            .sortedByDescending { category -> category.score }
        if (categories.isEmpty()) return null

        val top = categories.first()
        val parsedDocType = mapLabelToDocType(top.label) ?: return null
        return DocTypeModelPrediction(
            docType = parsedDocType,
            confidence = top.score.toDouble().coerceIn(0.0, 1.0),
            rankedLabels = categories.take(3).map { category ->
                category.label to category.score.toDouble().coerceIn(0.0, 1.0)
            },
        )
    }

    private fun mapLabelToDocType(rawLabel: String): ParsedDocType? {
        val label = rawLabel
            .trim()
            .uppercase()
            .replace(Regex("[^A-Z_]"), "_")

        return when {
            label.contains("MATERIAL") -> ParsedDocType.MATERIALS_TABLE
            label.contains("SERVICE") || label.contains("MACHINERY") -> ParsedDocType.SERVICE_MACHINERY
            label.contains("UNKNOWN") || label.contains("OTHER") -> ParsedDocType.UNKNOWN
            else -> null
        }
    }
}
