package ai.webwaifu.mobile.ui

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import java.util.Locale

data class InstalledSpeechRecognizer(
    val component: String,
    val label: String,
)

class NativeSpeechInputController internal constructor(
    val isListening: Boolean,
    val partialText: String,
    val rms: Float,
    val error: String?,
    val usingOnDeviceRecognizer: Boolean,
    private val startAction: () -> Unit,
    private val stopAction: () -> Unit,
) {
    fun start() = startAction()

    fun stop() = stopAction()
}

fun installedSpeechRecognizers(context: Context): List<InstalledSpeechRecognizer> {
    val intent = Intent(RecognitionService.SERVICE_INTERFACE)
    val services =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.queryIntentServices(
                intent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong()),
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.queryIntentServices(intent, 0)
        }
    return services
        .map { info ->
            val service = info.serviceInfo
            InstalledSpeechRecognizer(
                component = ComponentName(service.packageName, service.name).flattenToString(),
                label =
                    info.loadLabel(context.packageManager)
                        ?.toString()
                        ?.ifBlank { service.packageName }
                        ?: service.packageName,
            )
        }
        .distinctBy { it.component }
        .sortedBy { it.label.lowercase(Locale.getDefault()) }
}

@Composable
fun rememberNativeSpeechInput(
    selectedService: String,
    onBeforeStart: () -> Unit,
    onPartial: (String) -> Unit,
    onFinal: (String) -> Unit,
): NativeSpeechInputController {
    val context = LocalContext.current
    val latestBeforeStart by rememberUpdatedState(onBeforeStart)
    val latestPartial by rememberUpdatedState(onPartial)
    val latestFinal by rememberUpdatedState(onFinal)
    var isListening by remember { mutableStateOf(false) }
    var partialText by remember { mutableStateOf("") }
    var rms by remember { mutableFloatStateOf(0f) }
    var error by remember { mutableStateOf<String?>(null) }

    val installedComponents =
        remember(context, selectedService) {
            installedSpeechRecognizers(context).mapTo(mutableSetOf()) { it.component }
        }
    val explicitComponent =
        remember(selectedService, installedComponents) {
            selectedService
                .takeIf { it.isNotBlank() && it in installedComponents }
                ?.let(ComponentName::unflattenFromString)
        }
    val onDeviceAvailable =
        remember(context, explicitComponent) {
            explicitComponent == null &&
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        }
    val recognizer =
        remember(context, explicitComponent, onDeviceAvailable) {
            runCatching {
                when {
                    explicitComponent != null ->
                        SpeechRecognizer.createSpeechRecognizer(context, explicitComponent)
                    onDeviceAvailable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
                        SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                    else -> SpeechRecognizer.createSpeechRecognizer(context)
                }
            }.recoverCatching {
                SpeechRecognizer.createSpeechRecognizer(context)
            }.getOrNull()
        }

    fun startRecognizer() {
        if (recognizer == null) {
            error = "No Android speech recognizer is available."
            return
        }
        latestBeforeStart()
        partialText = ""
        rms = 0f
        error = null
        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                )
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, onDeviceAvailable)
        runCatching {
            isListening = true
            recognizer.startListening(intent)
        }.onFailure {
            isListening = false
            error = it.message ?: "Speech recognition could not start."
        }
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startRecognizer()
            } else {
                error = "Microphone permission is required for Talk."
            }
        }

    DisposableEffect(recognizer) {
        val listener =
            object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    isListening = true
                }

                override fun onBeginningOfSpeech() {
                    isListening = true
                }

                override fun onRmsChanged(rmsdB: Float) {
                    rms = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                }

                override fun onBufferReceived(buffer: ByteArray?) = Unit

                override fun onEndOfSpeech() {
                    rms = 0f
                }

                override fun onError(code: Int) {
                    isListening = false
                    rms = 0f
                    if (code != SpeechRecognizer.ERROR_NO_MATCH &&
                        code != SpeechRecognizer.ERROR_SPEECH_TIMEOUT &&
                        code != SpeechRecognizer.ERROR_CLIENT
                    ) {
                        error = recognitionErrorMessage(code)
                    }
                }

                override fun onResults(results: Bundle?) {
                    isListening = false
                    rms = 0f
                    val text = bestResult(results)
                    partialText = text
                    if (text.isNotBlank()) latestFinal(text)
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val text = bestResult(partialResults)
                    if (text.isNotBlank()) {
                        partialText = text
                        latestPartial(text)
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            }
        recognizer?.setRecognitionListener(listener)
        onDispose {
            recognizer?.cancel()
            recognizer?.destroy()
        }
    }

    return NativeSpeechInputController(
        isListening = isListening,
        partialText = partialText,
        rms = rms,
        error = error,
        usingOnDeviceRecognizer = onDeviceAvailable,
        startAction = {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                startRecognizer()
            } else {
                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        },
        stopAction = {
            recognizer?.stopListening()
            rms = 0f
        },
    )
}

private fun bestResult(bundle: Bundle?): String =
    bundle
        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        ?.firstOrNull()
        ?.trim()
        .orEmpty()

private fun recognitionErrorMessage(code: Int): String =
    when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "Microphone audio error."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission was denied."
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        -> "The selected speech recognizer needs a network connection."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer is busy. Tap Talk again."
        SpeechRecognizer.ERROR_SERVER -> "Speech recognition service error."
        else -> "Speech recognition failed ($code)."
    }
