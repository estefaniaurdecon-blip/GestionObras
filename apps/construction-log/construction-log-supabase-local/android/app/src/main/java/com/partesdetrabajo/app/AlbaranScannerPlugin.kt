package com.partesdetrabajo.app

import android.app.Activity
import android.content.Intent
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
import java.util.concurrent.Executors
import kotlin.math.abs

@CapacitorPlugin(name = "AlbaranScanner")
class AlbaranScannerPlugin : Plugin() {
    private val parser = AlbaranOcrParser()
    private val textRecognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val workerExecutor = Executors.newSingleThreadExecutor()

    private var controller: AlbaranScanController? = null
    private var pendingCall: PluginCall? = null
    private var scanLauncher: ActivityResultLauncher<IntentSenderRequest>? = null

    override fun load() {
        super.load()

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

        val launcher = scanLauncher
        val scanController = controller
        if (launcher == null || scanController == null) {
            call.reject("Escaner no inicializado")
            return
        }

        pendingCall = call

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
        pendingCall = null

        if (resultCode != Activity.RESULT_OK) {
            call.reject("Escaneo cancelado")
            return
        }

        val scanController = controller
        if (scanController == null) {
            call.reject("Escaner no disponible")
            return
        }

        val imageUris = scanController.extractImageUris(data)
        if (imageUris.isEmpty()) {
            call.reject("No se obtuvieron imagenes del albaran")
            return
        }

        workerExecutor.execute {
            try {
                val ocr = scanController.runOcr(imageUris, textRecognizer)
                val parsed = parser.parse(
                    lines = ocr.lines,
                    tokens = ocr.tokens,
                    pageWidth = ocr.pageWidth,
                )

                val payload = toJsPayload(parsed, imageUris.map { uri -> uri.toString() })
                activity.runOnUiThread {
                    call.resolve(payload)
                }
            } catch (error: Exception) {
                activity.runOnUiThread {
                    call.reject("Error al procesar OCR del albaran", error)
                }
            }
        }
    }

    private fun toJsPayload(parsed: ParsedDeliveryNote, imageUris: List<String>): JSObject {
        val payload = JSObject()
        payload.put("supplier", parsed.supplier ?: JSONObject.NULL)
        payload.put("invoiceNumber", parsed.invoiceNumber ?: JSONObject.NULL)
        payload.put("requiresReview", parsed.requiresReview)
        payload.put("reviewReason", parsed.reviewReason ?: JSONObject.NULL)
        payload.put("headerDetected", parsed.headerDetected)

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

        payload.put("items", items)
        payload.put("imageUris", uris)
        return payload
    }

    private fun rejectPending(message: String, error: Exception) {
        val call = pendingCall ?: return
        pendingCall = null
        call.reject(message, error)
    }
}
