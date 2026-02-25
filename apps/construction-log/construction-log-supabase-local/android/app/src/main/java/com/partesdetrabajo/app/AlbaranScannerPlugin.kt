package com.partesdetrabajo.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.util.concurrent.Executors
import kotlin.math.abs

@CapacitorPlugin(name = "AlbaranScanner")
class AlbaranScannerPlugin : Plugin() {
    companion object {
        private const val TAG = "ALBARAN_OCR"
    }

    private lateinit var parser: AlbaranOcrParser
    private var docIntClient: AlbaranDocIntClient? = null
    private var docTypeClassifier: AlbaranDocTypeClassifier? = null
    private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val workerExecutor = Executors.newSingleThreadExecutor()

    private var controller: AlbaranScanController? = null
    private var pendingCall: PluginCall? = null
    private var pendingAuthorizationHeader: String? = null
    private var pendingDocIntBaseUrl: String? = null
    private var scanLauncher: ActivityResultLauncher<IntentSenderRequest>? = null

    override fun load() {
        super.load()
        if (isDocIntEnabled()) {
            docIntClient = AlbaranDocIntClient(
                baseUrl = BuildConfig.AZURE_DOCINT_BASE_URL,
                timeoutMs = BuildConfig.AZURE_DOCINT_TIMEOUT_MS.toLong(),
            )
            Log.i(
                TAG,
                "Azure DocInt mode enabled baseUrl=${BuildConfig.AZURE_DOCINT_BASE_URL}",
            )
        } else {
            Log.i(TAG, "Azure DocInt mode disabled. Using legacy offline OCR parser.")
        }
        docTypeClassifier = TfliteAlbaranDocTypeClassifier(context.applicationContext)
        parser = AlbaranOcrParser(
            dictionaries = AlbaranParserDictionaries.loadOrDefault(context.assets),
            docTypeClassifier = docTypeClassifier,
        )

        val componentActivity = activity as? ComponentActivity
        if (componentActivity == null) {
            return
        }

        controller = AlbaranScanController(componentActivity)
        scanLauncher = componentActivity.registerForActivityResult(
            ActivityResultContracts.StartIntentSenderForResult(),
        ) { result ->
            handleScanResult(result.resultCode, result.data)
        }
    }

    @PluginMethod
    fun startScan(call: PluginCall) {
        if (pendingCall != null) {
            call.reject("Ya hay un escaneo en curso")
            return
        }

        if (isDocIntEnabled() && !hasNetworkConnection()) {
            call.reject("Sin conexion. No se puede escanear.")
            return
        }

        val launcher = scanLauncher
        val scanController = controller
        if (launcher == null || scanController == null) {
            call.reject("Escaner no inicializado")
            return
        }

        pendingCall = call
        pendingAuthorizationHeader = buildAuthorizationHeader(call)
        pendingDocIntBaseUrl = normalizeBaseUrl(call.getString("docIntBaseUrl"))
        Log.i(
            TAG,
            "startScan docIntOverride=${pendingDocIntBaseUrl ?: "-"} defaultBase=${BuildConfig.AZURE_DOCINT_BASE_URL}",
        )

        scanController.requestStartIntentSender(
            onSuccess = { intentSender ->
                try {
                    launcher.launch(IntentSenderRequest.Builder(intentSender).build())
                } catch (error: Exception) {
                    rejectPending("No se pudo abrir la camara del escaner", error)
                }
            },
            onError = { error ->
                rejectPending("No se pudo iniciar el escaneo de albaran", error)
            },
        )
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        runCatching { textRecognizer.close() }
        workerExecutor.shutdown()
    }

    private fun handleScanResult(resultCode: Int, data: Intent?) {
        val call = pendingCall ?: return
        val authorizationHeader = pendingAuthorizationHeader
        val docIntBaseUrlOverride = pendingDocIntBaseUrl
        pendingCall = null
        pendingAuthorizationHeader = null
        pendingDocIntBaseUrl = null

        if (resultCode != Activity.RESULT_OK) {
            call.reject("Escaneo cancelado")
            return
        }

        val scanController = controller
        if (scanController == null) {
            call.reject("Escaner no disponible")
            return
        }

        val capture = scanController.extractScanCapture(data)
        if (capture.imageUris.isEmpty()) {
            call.reject("No se obtuvieron imagenes del albaran")
            return
        }

        workerExecutor.execute {
            try {
                val parsedAndLines = if (isDocIntEnabled()) {
                    val upload = scanController.buildUploadDocument(capture)
                        ?: throw IllegalStateException("No se pudo preparar el archivo para subir")
                    val cloudParsed = processWithDocInt(
                        document = upload,
                        authorizationHeader = authorizationHeader,
                        baseUrlOverride = docIntBaseUrlOverride,
                    )

                    Log.i(
                        TAG,
                        "scanResult source=azure docType=${cloudParsed.docType.name} " +
                            "supplier=${cloudParsed.supplier ?: "-"} invoice=${cloudParsed.invoiceNumber ?: "-"} " +
                            "items=${cloudParsed.items.size} confidence=${cloudParsed.confidence} " +
                            "warnings=${cloudParsed.warnings.joinToString(",")}",
                    )

                    Pair(cloudParsed, emptyList<OcrLine>())
                } else {
                    val ocr = scanController.runOcr(capture.imageUris, textRecognizer)
                    val offlineParsed = parser.parse(
                        lines = ocr.lines,
                        tokens = ocr.tokens,
                        pageWidth = ocr.pageWidth,
                        profileUsed = ocr.profileUsed,
                        ocrScore = ocr.score,
                        ocrConfidence = ocr.confidence,
                        ocrWarnings = ocr.warnings,
                        rawText = ocr.rawText,
                    )

                    Log.i(
                        TAG,
                        "scanResult source=offline profile=${ocr.profileUsed} score=${ocr.score} " +
                            "lines=${ocr.lines.size} tokens=${ocr.tokens.size} ocrWarnings=${ocr.warnings.joinToString(",")} " +
                            "parsedWarnings=${offlineParsed.warnings.joinToString(",")} " +
                            "docType=${offlineParsed.docType.name} supplier=${offlineParsed.supplier ?: "-"} " +
                            "invoice=${offlineParsed.invoiceNumber ?: "-"} items=${offlineParsed.items.size} confidence=${offlineParsed.confidence} " +
                            "review=${offlineParsed.requiresReview}",
                    )

                    Pair(offlineParsed, ocr.ocrLinePreviews)
                }

                val payload = toJsPayload(
                    parsed = parsedAndLines.first,
                    imageUris = capture.imageUris.map { uri -> uri.toString() },
                    ocrLines = parsedAndLines.second,
                )
                activity.runOnUiThread {
                    call.resolve(payload)
                }
            } catch (error: Exception) {
                Log.e(TAG, "Error al procesar OCR del albaran", error)
                activity.runOnUiThread {
                    val detail = error.message
                        ?.replace(Regex("\\s+"), " ")
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                    val userMessage = when {
                        detail == null -> "Error al procesar OCR del albaran"
                        detail.contains("Limite de Azure F0", ignoreCase = true) -> detail
                        detail.contains("Sesion no valida", ignoreCase = true) -> detail
                        detail.contains("Sin conexion", ignoreCase = true) -> detail
                        else -> "Error al procesar OCR del albaran: $detail"
                    }
                    call.reject(userMessage, error)
                }
            }
        }
    }

    private fun hasNetworkConnection(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        val hasTransport = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        return hasInternet || hasTransport
    }

    private fun toJsPayload(
        parsed: ParsedDeliveryNote,
        imageUris: List<String>,
        ocrLines: List<OcrLine>,
    ): JSObject {
        val payload = JSObject()
        payload.put("supplier", parsed.supplier ?: JSONObject.NULL)
        payload.put("supplierNormalized", parsed.supplierNormalized ?: JSONObject.NULL)
        payload.put("invoiceNumber", parsed.invoiceNumber ?: JSONObject.NULL)
        payload.put("documentDate", parsed.documentDate ?: JSONObject.NULL)
        payload.put("docType", parsed.docType.name)
        payload.put("docSubtype", parsed.docSubtype ?: JSONObject.NULL)
        payload.put("serviceDescription", parsed.serviceDescription ?: JSONObject.NULL)
        payload.put("confidence", parsed.confidence)
        payload.put("score", parsed.score)
        payload.put("profileUsed", parsed.profileUsed)
        payload.put("rawText", parsed.rawText)
        payload.put("requiresReview", parsed.requiresReview)
        payload.put("reviewReason", parsed.reviewReason ?: JSONObject.NULL)
        payload.put("headerDetected", parsed.headerDetected)
        val warnings = JSArray()
        parsed.warnings.forEach { warning -> warnings.put(warning) }
        payload.put("warnings", warnings)

        val fieldConfidence = JSObject()
        fieldConfidence.put("supplier", parsed.fieldConfidence.supplier ?: JSONObject.NULL)
        fieldConfidence.put("invoiceNumber", parsed.fieldConfidence.invoiceNumber ?: JSONObject.NULL)
        fieldConfidence.put("documentDate", parsed.fieldConfidence.documentDate ?: JSONObject.NULL)
        fieldConfidence.put("table", parsed.fieldConfidence.table ?: JSONObject.NULL)
        payload.put("fieldConfidence", fieldConfidence)

        val fieldWarnings = JSObject()
        fieldWarnings.put("supplier", toJsArray(parsed.fieldWarnings.supplier))
        fieldWarnings.put("invoiceNumber", toJsArray(parsed.fieldWarnings.invoiceNumber))
        fieldWarnings.put("documentDate", toJsArray(parsed.fieldWarnings.documentDate))
        fieldWarnings.put("table", toJsArray(parsed.fieldWarnings.table))
        payload.put("fieldWarnings", fieldWarnings)
        payload.put("fieldMeta", toJsDynamicValue(parsed.fieldMeta))
        payload.put("templateData", toJsDynamicValue(parsed.templateData))

        val items = JSArray()
        parsed.items.forEach { item ->
            val row = JSObject()
            row.put("material", item.material)
            row.put("quantity", item.quantity ?: JSONObject.NULL)
            row.put("unit", item.unit ?: JSONObject.NULL)
            row.put("unitPrice", item.unitPrice ?: JSONObject.NULL)
            row.put("costDoc", item.costDoc ?: JSONObject.NULL)
            row.put("rowText", item.rowText)
            row.put("missingCritical", item.missingCritical)

            val costCalc = if (item.quantity != null && item.unitPrice != null) item.quantity * item.unitPrice else null
            val difference = if (costCalc != null && item.costDoc != null) abs(item.costDoc - costCalc) else null

            row.put("costCalc", costCalc ?: JSONObject.NULL)
            row.put("difference", difference ?: JSONObject.NULL)
            items.put(row)
        }

        val uris = JSArray()
        imageUris.forEach { uri -> uris.put(uri) }

        val lines = JSArray()
        ocrLines.forEach { line ->
            val row = JSObject()
            row.put("text", line.text)
            row.put("page", line.page)
            row.put("left", line.left)
            row.put("top", line.top)
            row.put("right", line.right)
            row.put("bottom", line.bottom)
            lines.put(row)
        }

        payload.put("items", items)
        payload.put("imageUris", uris)
        payload.put("ocrLines", lines)
        return payload
    }

    private fun rejectPending(message: String, error: Exception) {
        val call = pendingCall ?: return
        pendingCall = null
        pendingAuthorizationHeader = null
        pendingDocIntBaseUrl = null
        call.reject(message, error)
    }

    private fun buildAuthorizationHeader(call: PluginCall): String? {
        val token = call.getString("authToken")?.trim()
        if (token.isNullOrBlank()) return null
        val tokenType = call.getString("tokenType")?.trim().takeUnless { it.isNullOrBlank() } ?: "Bearer"
        return "$tokenType $token"
    }

    private fun isDocIntEnabled(): Boolean {
        return BuildConfig.USE_DOCINT || BuildConfig.USE_AZURE_DOCINT
    }

    private fun processWithDocInt(
        document: UploadDocument,
        authorizationHeader: String?,
        baseUrlOverride: String?,
    ): ParsedDeliveryNote {
        val baseUrls = buildDocIntBaseCandidates(baseUrlOverride)
        Log.i(TAG, "DocInt baseUrl candidates=${baseUrls.joinToString(" -> ")}")
        var lastError: Exception? = null

        for (index in baseUrls.indices) {
            val baseUrl = baseUrls[index]
            val client = getOrCreateDocIntClient(baseUrl)

            try {
                if (index > 0) {
                    Log.i(TAG, "Retrying DocInt with fallback baseUrl=$baseUrl")
                }
                return client.process(document, authorizationHeader)
            } catch (error: Exception) {
                lastError = error
                val hasNext = index < baseUrls.lastIndex
                val shouldRetry = hasNext && shouldRetryWithAnotherBaseUrl(error)
                Log.w(
                    TAG,
                    "DocInt request failed baseUrl=$baseUrl hasNext=$hasNext retry=$shouldRetry " +
                        "reason=${error::class.java.simpleName}: ${error.message}",
                )
                if (shouldRetry) {
                    Log.w(
                        TAG,
                        "DocInt request failed on baseUrl=$baseUrl, trying next. reason=${error.message}",
                    )
                    continue
                }
                throw error
            }
        }

        throw lastError ?: IllegalStateException("No se pudo conectar con DocInt")
    }

    private fun getOrCreateDocIntClient(baseUrl: String): AlbaranDocIntClient {
        val normalizedDefault = normalizeBaseUrl(BuildConfig.AZURE_DOCINT_BASE_URL)
        return if (normalizedDefault != null && baseUrl == normalizedDefault) {
            docIntClient ?: AlbaranDocIntClient(
                baseUrl = baseUrl,
                timeoutMs = BuildConfig.AZURE_DOCINT_TIMEOUT_MS.toLong(),
            ).also { created ->
                docIntClient = created
            }
        } else {
            AlbaranDocIntClient(
                baseUrl = baseUrl,
                timeoutMs = BuildConfig.AZURE_DOCINT_TIMEOUT_MS.toLong(),
            )
        }
    }

    private fun buildDocIntBaseCandidates(baseUrlOverride: String?): List<String> {
        val out = linkedSetOf<String>()
        val normalizedOverride = normalizeBaseUrl(baseUrlOverride)
        val normalizedDefault = normalizeBaseUrl(BuildConfig.AZURE_DOCINT_BASE_URL)
        val preferredPort = extractPort(normalizedOverride)
            ?: extractPort(normalizedDefault)
            ?: 7071
        val emulator = isProbablyEmulator()

        // Prioriza URL explícita (JS/env) y URL por BuildConfig.
        normalizedOverride?.let(out::add)
        normalizedDefault?.let(out::add)

        val seed = out.toList()
        seed.forEach { base ->
            deriveHostVariant(base, "127.0.0.1")?.let(out::add)
            deriveHostVariant(base, "localhost")?.let(out::add)
            if (emulator) {
                deriveHostVariant(base, "10.0.2.2")?.let(out::add)
                deriveHostVariant(base, "10.0.3.2")?.let(out::add)
            }
        }

        // Fallback final: loopback (útil con USB + adb reverse).
        seedLocalhostCandidates(out, preferredPort)
        if (emulator) {
            out.add("http://10.0.2.2:$preferredPort")
            out.add("http://10.0.3.2:$preferredPort")
        }

        return out.toList()
    }

    private fun seedLocalhostCandidates(out: LinkedHashSet<String>, preferredPort: Int) {
        out.add("http://127.0.0.1:$preferredPort")
        out.add("http://localhost:$preferredPort")
    }

    private fun extractPort(baseUrl: String?): Int? {
        return try {
            val uri = URI(baseUrl ?: return null)
            if (uri.port > 0) uri.port else null
        } catch (_: Exception) {
            null
        }
    }

    private fun deriveHostVariant(baseUrl: String, targetHost: String): String? {
        return try {
            val uri = URI(baseUrl)
            val sourceHost = uri.host?.trim()?.lowercase() ?: return null
            val canSwapLocalHost = sourceHost == "localhost" ||
                sourceHost == "127.0.0.1" ||
                sourceHost == "10.0.2.2" ||
                sourceHost == "10.0.3.2"
            if (!canSwapLocalHost || sourceHost == targetHost) return null

            val replaced = URI(
                uri.scheme,
                uri.userInfo,
                targetHost,
                uri.port,
                uri.path,
                uri.query,
                uri.fragment,
            ).toString()
            normalizeBaseUrl(replaced)
        } catch (_: Exception) {
            null
        }
    }

    private fun normalizeBaseUrl(baseUrl: String?): String? {
        val trimmed = baseUrl?.trim()?.removeSuffix("/") ?: return null
        return trimmed.ifBlank { null }
    }

    private fun shouldRetryWithAnotherBaseUrl(error: Exception): Boolean {
        if (isNetworkException(error)) return true
        val message = error.message?.lowercase() ?: return false
        if (message.contains("sesion no valida")) return false
        if (message.contains("limite de azure f0")) return false
        if (message.contains("docint proxy error http")) return false
        if (message.contains("http 401") || message.contains("http 403") || message.contains("http 429")) return false

        return message.contains("failed to connect") ||
            message.contains("connection refused") ||
            message.contains("unable to resolve host") ||
            message.contains("timeout") ||
            message.contains("no route to host") ||
            message.contains("network is unreachable") ||
            message.contains("cleart")
    }

    private fun isProbablyEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.lowercase()
        val model = Build.MODEL.lowercase()
        val product = Build.PRODUCT.lowercase()
        val brand = Build.BRAND.lowercase()
        val device = Build.DEVICE.lowercase()

        return fingerprint.contains("generic") ||
            fingerprint.contains("emulator") ||
            model.contains("emulator") ||
            model.contains("sdk") ||
            product.contains("sdk") ||
            product.contains("emulator") ||
            (brand.startsWith("generic") && device.startsWith("generic"))
    }

    private fun isNetworkException(error: Throwable?): Boolean {
        var current = error
        while (current != null) {
            if (current is IOException) return true
            current = current.cause
        }
        return false
    }

    private fun toJsArray(values: List<String>): JSArray {
        val array = JSArray()
        values.forEach { value -> array.put(value) }
        return array
    }

    private fun toJsDynamicValue(value: Any?): Any {
        return when (value) {
            null -> JSONObject.NULL
            is String, is Number, is Boolean -> value
            is Map<*, *> -> {
                val obj = JSObject()
                value.forEach { (key, nested) ->
                    if (key != null) {
                        obj.put(key.toString(), toJsDynamicValue(nested))
                    }
                }
                obj
            }
            is Iterable<*> -> {
                val array = JSArray()
                value.forEach { nested -> array.put(toJsDynamicValue(nested)) }
                array
            }
            is Array<*> -> {
                val array = JSArray()
                value.forEach { nested -> array.put(toJsDynamicValue(nested)) }
                array
            }
            else -> value.toString()
        }
    }
}
