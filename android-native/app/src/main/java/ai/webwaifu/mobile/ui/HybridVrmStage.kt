package ai.webwaifu.mobile.ui

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import ai.webwaifu.mobile.data.VrmLibraryStore
import ai.webwaifu.mobile.model.BUNDLED_VRM_MODELS
import ai.webwaifu.mobile.model.CameraViewMode
import ai.webwaifu.mobile.model.WaifuUiState
import java.io.ByteArrayInputStream
import org.json.JSONObject

private const val APP_ASSET_HOST = "appassets.androidplatform.net"
private const val AVATAR_PAGE =
    "https://$APP_ASSET_HOST/assets/avatar/mobile-avatar.html"

/**
 * Android stays responsible for application state, provider traffic, secrets, storage, and audio.
 * This local-only WebView runs Waifu4's original VrmStage renderer from APK assets.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun HybridVrmStage(
    state: WaifuUiState,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val vrmLibrary = remember { VrmLibraryStore(context) }
    var rendererReady by remember { mutableStateOf(false) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val webView =
        remember(context) {
            val assetLoader =
                WebViewAssetLoader.Builder()
                    .addPathHandler(
                        "/assets/",
                        WebViewAssetLoader.AssetsPathHandler(context),
                    )
                    .addPathHandler(
                        "/vrm/",
                        WebViewAssetLoader.PathHandler { path ->
                            val id = path.removeSuffix(".vrm")
                            vrmLibrary.openStream(id)?.let { stream ->
                                WebResourceResponse("model/gltf-binary", null, stream)
                            }
                        },
                    )
                    .build()
            WebView(context).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                overScrollMode = View.OVER_SCROLL_NEVER
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = false
                    allowFileAccess = false
                    allowContentAccess = false
                    mediaPlaybackRequiresUserGesture = false
                    setSupportZoom(false)
                    builtInZoomControls = false
                    displayZoomControls = false
                    safeBrowsingEnabled = true
                }
                addJavascriptInterface(
                    AvatarJavascriptBridge(
                        onReady = {
                            mainHandler.post { rendererReady = true }
                        },
                    ),
                    "AndroidAvatar",
                )
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? {
                            val uri = request.url
                            return if (uri.scheme == "https" && uri.host == APP_ASSET_HOST) {
                                assetLoader.shouldInterceptRequest(uri)
                            } else {
                                WebResourceResponse(
                                    "text/plain",
                                    "UTF-8",
                                    403,
                                    "Blocked",
                                    emptyMap(),
                                    ByteArrayInputStream(ByteArray(0)),
                                )
                            }
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean =
                            request.url.host != APP_ASSET_HOST
                    }
                loadUrl(AVATAR_PAGE)
            }
        }

    DisposableEffect(webView) {
        onDispose {
            webView.removeJavascriptInterface("AndroidAvatar")
            webView.stopLoading()
            webView.destroy()
        }
    }

    LaunchedEffect(rendererReady, state.activeVrmModelId, state.activeBundledVrmId) {
        if (!rendererReady) return@LaunchedEffect
        val modelUrl =
            state.activeVrmModelId?.let { id ->
                "https://$APP_ASSET_HOST/vrm/${Uri.encode(id)}.vrm"
            } ?: BUNDLED_VRM_MODELS
                .firstOrNull { it.id == state.activeBundledVrmId }
                ?.assetPath
                ?.let { "https://$APP_ASSET_HOST/assets/$it" }
        webView.sendAvatarCommand(
            JSONObject()
                .put("type", "model")
                .put("url", modelUrl),
        )
    }

    LaunchedEffect(
        rendererReady,
        state.settings.cameraViewMode,
        state.settings.avatarScale,
        state.settings.avatarPositionX,
        state.settings.avatarPositionZ,
        state.settings.avatarVerticalOffset,
        state.settings.avatarRotationX,
        state.settings.avatarRotationY,
        state.settings.avatarRotationZ,
        state.settings.sceneExposure,
        state.settings.colorCorrectionEnabled,
        state.settings.colorPowerR,
        state.settings.colorPowerG,
        state.settings.colorPowerB,
    ) {
        if (!rendererReady) return@LaunchedEffect
        val settings = state.settings
        webView.sendAvatarCommand(
            JSONObject()
                .put("type", "visual")
                .put(
                    "settings",
                    JSONObject()
                        .put(
                            "cameraViewMode",
                            if (settings.cameraViewMode == CameraViewMode.FULL_BODY) {
                                "full-body"
                            } else {
                                "half-body"
                            },
                        )
                        .put("modelScale", settings.avatarScale)
                        .put("modelPositionX", settings.avatarPositionX)
                        .put("modelPositionZ", settings.avatarPositionZ)
                        .put("modelVerticalOffset", -0.62f + settings.avatarVerticalOffset)
                        .put("modelRotationX", settings.avatarRotationX)
                        .put("modelRotationY", settings.avatarRotationY)
                        .put("modelRotationZ", settings.avatarRotationZ)
                        .put("sceneExposure", settings.sceneExposure)
                        .put("colorCorr", settings.colorCorrectionEnabled)
                        .put("colorPowR", settings.colorPowerR)
                        .put("colorPowG", settings.colorPowerG)
                        .put("colorPowB", settings.colorPowerB),
                ),
        )
    }

    LaunchedEffect(
        rendererReady,
        state.settings.animationPlaying,
        state.settings.animationShuffle,
        state.settings.animationLoop,
        state.settings.animationSpeed,
        state.settings.animationDurationSeconds,
    ) {
        if (!rendererReady) return@LaunchedEffect
        val settings = state.settings
        webView.sendAvatarCommand(
            JSONObject()
                .put("type", "sequencer")
                .put(
                    "settings",
                    JSONObject()
                        .put("playing", settings.animationPlaying)
                        .put("shuffle", settings.animationShuffle)
                        .put("loop", settings.animationLoop)
                        .put("speed", settings.animationSpeed)
                        .put("duration", settings.animationDurationSeconds),
                ),
        )
    }

    LaunchedEffect(
        rendererReady,
        state.isSpeaking,
        state.speechAmplitude,
        state.mouthWeights,
        state.frequencyBands,
    ) {
        if (!rendererReady) return@LaunchedEffect
        webView.sendAvatarCommand(
            JSONObject()
                .put("type", "lipSync")
                .put("active", state.isSpeaking)
                .put("amplitude", state.speechAmplitude)
                .put(
                    "weights",
                    JSONObject()
                        .put("aa", state.mouthWeights.aa)
                        .put("ih", state.mouthWeights.ih)
                        .put("ou", state.mouthWeights.ou)
                        .put("ee", state.mouthWeights.ee)
                        .put("oh", state.mouthWeights.oh),
                )
                .put(
                    "bands",
                    JSONObject()
                        .put("low", state.frequencyBands.low)
                        .put("midLow", state.frequencyBands.midLow)
                        .put("midHigh", state.frequencyBands.midHigh)
                        .put("high", state.frequencyBands.high),
                ),
        )
    }

    LaunchedEffect(rendererReady, state.emotionTriggeredAtMillis, state.emotion) {
        if (!rendererReady || state.emotionTriggeredAtMillis <= 0L) return@LaunchedEffect
        webView.sendAvatarCommand(
            JSONObject()
                .put("type", "expression")
                .put(
                    "request",
                    JSONObject()
                        .put("durationMs", 2_400)
                        .put("expression", state.emotion.name)
                        .put("intensity", state.emotion.intensity)
                        .put("nonce", state.emotionTriggeredAtMillis)
                        .put(
                            "vad",
                            JSONObject()
                                .put("arousal", state.emotion.arousal)
                                .put("dominance", state.emotion.dominance)
                                .put("valence", state.emotion.valence),
                        ),
                ),
        )
    }

    AndroidView(
        factory = { webView },
        modifier = modifier,
    )
}

private class AvatarJavascriptBridge(
    private val onReady: () -> Unit,
) {
    @JavascriptInterface
    fun onReady() {
        onReady.invoke()
    }

    @JavascriptInterface
    fun onEvent(json: String) {
        // Telemetry remains available for the Android adapter without exposing provider controls.
        if (json.length > MAX_TELEMETRY_LENGTH) return
    }

    private companion object {
        const val MAX_TELEMETRY_LENGTH = 64 * 1024
    }
}

private fun WebView.sendAvatarCommand(command: JSONObject) {
    evaluateJavascript(
        "window.WebWaifuAvatar?.receive(${JSONObject.quote(command.toString())})",
        null,
    )
}
