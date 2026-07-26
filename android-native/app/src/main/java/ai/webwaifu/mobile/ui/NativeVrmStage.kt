package ai.webwaifu.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.os.SystemClock
import ai.webwaifu.mobile.data.VrmLibraryStore
import ai.webwaifu.mobile.model.BUNDLED_ANIMATION_CLIPS
import ai.webwaifu.mobile.model.WaifuUiState
import ai.webwaifu.mobile.model.BUNDLED_VRM_MODELS
import ai.webwaifu.mobile.model.CameraViewMode
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.LipSyncMode
import ai.webwaifu.mobile.model.MouthWeights
import com.google.android.filament.ColorGrading
import com.google.android.filament.LightManager
import com.google.android.filament.View
import dev.romainguy.kotlin.math.Float3
import dev.romainguy.kotlin.math.Float4
import dev.romainguy.kotlin.math.Quaternion
import io.github.sceneview.Scene
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.math.Scale
import io.github.sceneview.node.LightNode
import io.github.sceneview.node.ModelNode
import io.github.sceneview.node.Node
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberCameraNode
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberEnvironmentLoader
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberNode
import io.github.sceneview.rememberView
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Native Android equivalent of Waifu4's VrmStage.
 *
 * SceneView supplies a Jetpack Compose viewport backed by Google's Filament renderer. The bundled
 * file is Waifu4's own Neuro-sama VRM; it is loaded as glTF binary without a WebView or JS runtime.
 */
@Composable
internal fun NativeVrmStage(
    state: WaifuUiState,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val vrmLibraryStore = remember { VrmLibraryStore(context) }
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)
    val environmentLoader = rememberEnvironmentLoader(engine)
    val filamentView =
        rememberView(engine) {
            engine.createView().apply {
                isPostProcessingEnabled = true
                antiAliasing = View.AntiAliasing.FXAA
                dithering = View.Dithering.TEMPORAL
            }
        }
    val colorGradingHolder =
        remember(engine, filamentView) { arrayOfNulls<ColorGrading>(1) }
    DisposableEffect(engine, filamentView) {
        onDispose {
            filamentView.colorGrading = null
            colorGradingHolder[0]?.let(engine::destroyColorGrading)
            colorGradingHolder[0] = null
        }
    }
    LaunchedEffect(
        engine,
        filamentView,
        state.settings.colorCorrectionEnabled,
        state.settings.sceneExposure,
        state.settings.colorPowerR,
        state.settings.colorPowerG,
        state.settings.colorPowerB,
    ) {
        val next = buildNativeColorGrading(engine, state.settings)
        filamentView.colorGrading = next
        colorGradingHolder[0]?.let(engine::destroyColorGrading)
        colorGradingHolder[0] = next
    }
    LaunchedEffect(
        filamentView,
        state.settings.postProcessingEnabled,
        state.settings.bloomEnabled,
        state.settings.bloomStrength,
        state.settings.vignetteEnabled,
        state.settings.vignetteStrength,
        state.settings.ambientOcclusionEnabled,
        state.settings.ambientOcclusionIntensity,
        state.settings.dynamicResolutionEnabled,
    ) {
        val settings = state.settings
        filamentView.isPostProcessingEnabled = settings.postProcessingEnabled
        filamentView.bloomOptions =
            View.BloomOptions().apply {
                enabled = settings.postProcessingEnabled && settings.bloomEnabled
                strength = settings.bloomStrength.coerceIn(0f, 1f)
                resolution = 360
                levels = 4
                threshold = true
                quality = View.QualityLevel.LOW
            }
        filamentView.vignetteOptions =
            View.VignetteOptions().apply {
                val strength = settings.vignetteStrength.coerceIn(0f, 1f)
                enabled = settings.postProcessingEnabled && settings.vignetteEnabled
                midPoint = 0.92f - strength * 0.38f
                roundness = 0.72f
                feather = 0.72f - strength * 0.42f
                color = floatArrayOf(0.015f, 0.008f, 0.02f, 1f)
            }
        filamentView.ambientOcclusion =
            if (settings.postProcessingEnabled && settings.ambientOcclusionEnabled) {
                View.AmbientOcclusion.SSAO
            } else {
                View.AmbientOcclusion.NONE
            }
        filamentView.ambientOcclusionOptions =
            View.AmbientOcclusionOptions().apply {
                enabled = settings.postProcessingEnabled && settings.ambientOcclusionEnabled
                intensity = settings.ambientOcclusionIntensity.coerceIn(0f, 2f)
                radius = 0.22f
                power = 1.15f
                resolution = 0.5f
                quality = View.QualityLevel.LOW
                lowPassFilter = View.QualityLevel.LOW
                upsampling = View.QualityLevel.LOW
            }
        filamentView.dynamicResolutionOptions =
            View.DynamicResolutionOptions().apply {
                enabled = settings.dynamicResolutionEnabled
                minScale = 0.6f
                maxScale = 0.85f
                sharpness = 0.9f
                homogeneousScaling = true
                quality = View.QualityLevel.LOW
            }
    }
    val cameraPosition = remember { Position(y = 1.34f, z = 1.45f) }
    val cameraTarget = remember { Position(y = 1.32f) }
    val cameraNode =
        rememberCameraNode(engine) {
            position = cameraPosition
            lookAt(cameraTarget)
        }
    val cameraManipulator =
        rememberCameraManipulator(
            orbitHomePosition = cameraPosition,
            targetPosition = cameraTarget,
        )
    // Native equivalents of Waifu4's three directional lights. Filament expresses directional
    // intensity in lux, so the Three.js 0.8 / 0.3 / 0.35 strengths map to 80k / 30k / 35k.
    val keyLightNode =
        rememberNode {
            LightNode(
                engine = engine,
                type = LightManager.Type.DIRECTIONAL,
                apply = {},
            ).apply {
                lightDirection = Float3(-0.51f, -0.75f, -0.41f)
                color = Float4(1f, 1f, 1f, 1f)
                intensity = 80_000f
                isShadowCaster = false
            }
        }
    val fillLightNode =
        rememberNode {
            LightNode(
                engine = engine,
                type = LightManager.Type.DIRECTIONAL,
                apply = {},
            ).apply {
                lightDirection = Float3(0.61f, -0.65f, 0.44f)
                color = Float4(0.491f, 0.638f, 1f, 1f)
                intensity = 30_000f
                isShadowCaster = false
            }
        }
    val rimLightNode =
        rememberNode {
            LightNode(
                engine = engine,
                type = LightManager.Type.DIRECTIONAL,
                apply = {},
            ).apply {
                lightDirection = Float3(0.39f, -0.65f, 0.65f)
                color = Float4(0.275f, 0.491f, 1f, 1f)
                intensity = 35_000f
                isShadowCaster = false
            }
        }

    var modelNode by remember { mutableStateOf<ModelNode?>(null) }
    var outlineNode by remember { mutableStateOf<ModelNode?>(null) }
    var mtoonModel by remember { mutableStateOf<NativeMToonModel?>(null) }
    var outlinePosePairs by remember { mutableStateOf<List<Pair<Node, Node>>>(emptyList()) }
    var animationSequencer by remember { mutableStateOf<NativeAnimationSequencer?>(null) }
    var targetHumanoidRig by remember { mutableStateOf<TargetHumanoidRig?>(null) }
    var expressionRig by remember { mutableStateOf<VrmExpressionRig?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    val lipSyncRuntime = remember { NativeLipSyncRuntime() }
    val selectedSavedModel =
        state.savedVrmModels.firstOrNull { it.id == state.activeVrmModelId }
    val selectedBundledModel =
        BUNDLED_VRM_MODELS.firstOrNull { it.id == state.activeBundledVrmId }
            ?: BUNDLED_VRM_MODELS.first { it.id == DEFAULT_BUNDLED_VRM_ID }

    LaunchedEffect(modelLoader, state.activeVrmModelId, state.avatarRevision) {
        loadError = null
        val previousNode = modelNode
        val previousOutlineNode = outlineNode
        val previousMtoonModel = mtoonModel
        modelNode = null
        outlineNode = null
        mtoonModel = null
        outlinePosePairs = emptyList()
        animationSequencer = null
        targetHumanoidRig = null
        expressionRig = null
        previousNode?.renderableNodes?.forEach { renderable ->
            if (renderable.morphTargetNames.isNotEmpty()) {
                renderable.setMorphWeights(FloatArray(renderable.morphTargetNames.size), 0)
            }
        }
        previousNode?.destroy()
        previousOutlineNode?.destroy()
        if (previousMtoonModel != null) {
            previousMtoonModel.destroyResources()
        } else {
            previousNode?.model?.let(modelLoader::destroyModel)
        }
        runCatching {
            val loaded =
                withContext(Dispatchers.IO) {
                    val modelBytes =
                        if (selectedSavedModel == null) {
                            context.assets.open(selectedBundledModel.assetPath).use { it.readBytes() }
                        } else {
                            vrmLibraryStore.readBytes(selectedSavedModel)
                        }
                    LoadedVrm(
                        modelBytes = modelBytes,
                        preparedMtoon = VrmMToon.prepare(modelBytes),
                        targetRig = VrmaParser.parseTargetHumanoidRig(modelBytes),
                        expressionRig = VrmaParser.parseExpressionRig(modelBytes),
                        clips =
                            NATIVE_ENABLED_ANIMATIONS.associateWith { asset ->
                                val bytes = context.assets.open(asset).use { it.readBytes() }
                                VrmaParser.parse(bytes)
                            },
                    )
                }
            val nativeMtoon =
                loaded.preparedMtoon
                    .takeIf { it.materials.isNotEmpty() }
                    ?.let { NativeMToonModel.create(engine, it) }
            val node =
                (nativeMtoon?.bodyNode
                    ?: ModelNode(
                        modelInstance =
                            modelLoader.createModelInstance(ByteBuffer.wrap(loaded.modelBytes)),
                        autoAnimate = false,
                    )).apply {
                    position = Position(y = VRM_BASE_VERTICAL_OFFSET + DEFAULT_MODEL_VERTICAL_OFFSET)
                    rotation = Rotation(y = 180f)
                    isShadowCaster = true
                    isShadowReceiver = true
                }
            val nativeOutline =
                nativeMtoon?.outlineNode?.apply {
                    position = Position(y = VRM_BASE_VERTICAL_OFFSET + DEFAULT_MODEL_VERTICAL_OFFSET)
                    rotation = Rotation(y = 180f)
                    isShadowCaster = false
                    isShadowReceiver = false
                }
            LoadedNativeVrm(
                node = node,
                outlineNode = nativeOutline,
                mtoonModel = nativeMtoon,
                animators =
                    loaded.clips.mapValues { (_, clip) ->
                        NativeVrmaAnimator.bind(
                            clip = clip,
                            modelNode = node,
                            targetRig = loaded.targetRig,
                        )
                    },
                targetRig = loaded.targetRig,
                expressionRig = loaded.expressionRig,
            )
        }.onSuccess { loaded ->
            modelNode = loaded.node
            outlineNode = loaded.outlineNode
            mtoonModel = loaded.mtoonModel
            outlinePosePairs = buildOutlinePosePairs(loaded.node, loaded.outlineNode)
            animationSequencer = NativeAnimationSequencer(loaded.animators)
            targetHumanoidRig = loaded.targetRig
            expressionRig = loaded.expressionRig
        }.onFailure { error ->
            loadError = error.message ?: "The selected VRM could not be loaded."
        }
    }

    LaunchedEffect(
        modelNode,
        targetHumanoidRig,
        animationSequencer,
        state.settings.selectedAnimationAsset,
        state.avatarRevision,
    ) {
        val node = modelNode ?: return@LaunchedEffect
        val targetRig = targetHumanoidRig ?: return@LaunchedEffect
        val sequencer = animationSequencer ?: return@LaunchedEffect
        val asset = state.settings.selectedAnimationAsset
        if (asset.isBlank() || sequencer.hasAnimator(asset)) return@LaunchedEffect
        val clip =
            runCatching {
                withContext(Dispatchers.IO) {
                    context.assets.open(asset).use { VrmaParser.parse(it.readBytes()) }
                }
            }.getOrNull() ?: return@LaunchedEffect
        if (modelNode !== node || animationSequencer !== sequencer) return@LaunchedEffect
        sequencer.addAnimator(
            asset,
            NativeVrmaAnimator.bind(
                clip = clip,
                modelNode = node,
                targetRig = targetRig,
            ),
        )
    }

    val activeNode = modelNode
    val activeOutlineNode = outlineNode
    val morphBindings =
        remember(activeNode, expressionRig) {
            activeNode?.let { buildMorphBindings(it, expressionRig) }.orEmpty()
        }
    val outlineMorphBindings =
        remember(activeOutlineNode, expressionRig) {
            activeOutlineNode?.let { buildMorphBindings(it, expressionRig) }.orEmpty()
        }

    Box(
        modifier =
            modifier.background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF110B1A),
                        Color(0xFF261020),
                        Color(0xFF09070D),
                    ),
                ),
            ),
    ) {
        Scene(
            modifier = Modifier.fillMaxSize(),
            engine = engine,
            view = filamentView,
            modelLoader = modelLoader,
            environmentLoader = environmentLoader,
            isOpaque = false,
            cameraNode = cameraNode,
            cameraManipulator = cameraManipulator,
            mainLightNode = keyLightNode,
            childNodes =
                buildList {
                    add(fillLightNode)
                    add(rimLightNode)
                    activeNode?.let(::add)
                    activeOutlineNode?.let(::add)
                },
            onFrame = { frameTimeNanos ->
                activeNode?.let { node ->
                    val seconds = frameTimeNanos / 1_000_000_000.0
                    val settings = state.settings
                    val cameraPreset =
                        when (settings.cameraViewMode) {
                            CameraViewMode.HALF_BODY ->
                                CameraPreset(
                                    positionY = 1.34f,
                                    positionZ = 1.45f,
                                    targetY = 1.32f,
                                )
                            CameraViewMode.FULL_BODY ->
                                CameraPreset(
                                    positionY = 1.45f,
                                    positionZ = 3.2f,
                                    targetY = 1.4f,
                                )
                        }
                    cameraNode.position =
                        Position(y = cameraPreset.positionY, z = cameraPreset.positionZ)
                    cameraNode.lookAt(Position(y = cameraPreset.targetY))
                    val modelPosition =
                        Position(
                            x = settings.avatarPositionX,
                            y =
                                VRM_BASE_VERTICAL_OFFSET +
                                    DEFAULT_MODEL_VERTICAL_OFFSET +
                                    settings.avatarVerticalOffset +
                                    (sin(seconds * IDLE_BOB_RADIANS_PER_SECOND) * 0.008).toFloat(),
                            z = settings.avatarPositionZ,
                        )
                    val modelRotation =
                        Rotation(
                            x = settings.avatarRotationX,
                            y = 180f + settings.avatarRotationY,
                            z = settings.avatarRotationZ,
                        )
                    val modelScale =
                        Scale(
                            x = settings.avatarScale,
                            y = settings.avatarScale,
                            z = settings.avatarScale,
                        )
                    node.position = modelPosition
                    node.rotation = modelRotation
                    node.scale = modelScale
                    activeOutlineNode?.let { outline ->
                        outline.position = modelPosition
                        outline.rotation = modelRotation
                        outline.scale = modelScale
                    }
                    animationSequencer?.apply(
                        elapsedSeconds = seconds,
                        isGenerating = state.isGenerating,
                        emotion = state.emotion.name,
                        settings = settings,
                    )
                    outlinePosePairs.forEach { (bodyBone, outlineBone) ->
                        outlineBone.quaternion = bodyBone.quaternion
                    }
                    val mouth =
                        lipSyncRuntime.update(
                            state = state,
                            seconds = seconds,
                        )
                    applyMorphState(
                        bindings = morphBindings,
                        mouth = mouth,
                        emotion = state.emotion.name,
                        seconds = seconds,
                        emotionElapsedMillis =
                            SystemClock.elapsedRealtime() - state.emotionTriggeredAtMillis,
                    )
                    if (outlineMorphBindings.isNotEmpty()) {
                        applyMorphState(
                            bindings = outlineMorphBindings,
                            mouth = mouth,
                            emotion = state.emotion.name,
                            seconds = seconds,
                            emotionElapsedMillis =
                                SystemClock.elapsedRealtime() - state.emotionTriggeredAtMillis,
                        )
                    }
                }
            },
        )

        if (activeNode == null && loadError == null) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = Color(0xFFFF5C9A),
            )
        }
        loadError?.let { message ->
            Text(
                text = "VRM load failed: $message",
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .padding(24.dp),
                color = Color(0xFFFFA8B8),
                fontSize = 12.sp,
            )
        }
    }
}

/**
 * Filament's ASC CDL slope/offset/power stage is the native equivalent of Waifu4's
 * ColorCorrectionShader: `pow(rgb * 1.1, powRGB)`. Exposure is converted from Three.js's linear
 * multiplier to Filament's EV stops, and ACES legacy matches Three.js ACESFilmicToneMapping.
 */
private fun buildNativeColorGrading(
    engine: com.google.android.filament.Engine,
    settings: AppSettings,
): ColorGrading {
    val builder =
        ColorGrading.Builder()
            .toneMapping(ColorGrading.ToneMapping.ACES_LEGACY)
            .exposure(log2(settings.sceneExposure.coerceIn(0.35f, 1.8f)))
    if (settings.colorCorrectionEnabled) {
        builder.slopeOffsetPower(
            floatArrayOf(1.1f, 1.1f, 1.1f),
            floatArrayOf(0f, 0f, 0f),
            floatArrayOf(
                settings.colorPowerR.coerceIn(1f, 2f),
                settings.colorPowerG.coerceIn(1f, 2f),
                settings.colorPowerB.coerceIn(1f, 2f),
            ),
        )
    }
    return builder.build(engine)
}

private data class LoadedVrm(
    val modelBytes: ByteArray,
    val preparedMtoon: VrmMToon.PreparedModel,
    val targetRig: TargetHumanoidRig,
    val expressionRig: VrmExpressionRig,
    val clips: Map<String, VrmaClip>,
)

private data class CameraPreset(
    val positionY: Float,
    val positionZ: Float,
    val targetY: Float,
)

private data class LoadedNativeVrm(
    val node: ModelNode,
    val outlineNode: ModelNode?,
    val mtoonModel: NativeMToonModel?,
    val animators: Map<String, NativeVrmaAnimator>,
    val targetRig: TargetHumanoidRig,
    val expressionRig: VrmExpressionRig,
)

private fun buildOutlinePosePairs(
    body: ModelNode,
    outline: ModelNode?,
): List<Pair<Node, Node>> {
    if (outline == null) return emptyList()
    val outlineByName = outline.nodes.mapNotNull { node -> node.name?.let { it to node } }.toMap()
    return body.nodes.mapNotNull { bodyNode ->
        bodyNode.name?.let(outlineByName::get)?.let { outlineNode -> bodyNode to outlineNode }
    }
}

/**
 * Native equivalent of Waifu4's default AnimationSequencer: ten-second autoplay, loop, and a
 * shuffled non-repeating bag of the enabled safe Sachi ambient/talk clips. The one enabled Sachi
 * emotion clip is triggered when a completed reply is happy or amused, then autoplay resumes.
 */
private class NativeAnimationSequencer(
    animators: Map<String, NativeVrmaAnimator>,
) {
    private val animators = animators.toMutableMap()
    private val random = Random.Default
    private val bag = mutableListOf<String>()
    private val restPose =
        buildMap<Node, Q> {
            animators.values.forEach { animator -> putAll(animator.restPose) }
        }.toMutableMap()
    private val previousPose = mutableMapOf<Node, Q>()
    private val currentPose = mutableMapOf<Node, Q>()
    private var activeAsset = AUTO_PLAY_ANIMATIONS.first()
    private var activeStartedAt = Double.NaN
    private var previousAsset: String? = null
    private var previousStartedAt = Double.NaN
    private var transitionStartedAt = Double.NaN
    private var nextAdvanceAt = Double.NaN
    private var reactionEndsAt = Double.NaN
    private var lastGenerating = false
    private var lastDurationSeconds = DEFAULT_ANIMATION_DURATION_SECONDS

    fun hasAnimator(asset: String): Boolean = animators.containsKey(asset)

    fun addAnimator(
        asset: String,
        animator: NativeVrmaAnimator,
    ) {
        animators[asset] = animator
        animator.restPose.forEach { (node, rotation) ->
            restPose.putIfAbsent(node, rotation)
        }
    }

    fun apply(
        elapsedSeconds: Double,
        isGenerating: Boolean,
        emotion: String,
        settings: AppSettings,
    ) {
        if (!settings.animationPlaying) return
        val durationSeconds =
            settings.animationDurationSeconds
                .coerceIn(3f, 60f)
                .toDouble()
        if (lastDurationSeconds != durationSeconds) {
            lastDurationSeconds = durationSeconds
            nextAdvanceAt = elapsedSeconds + durationSeconds
        }
        if (activeStartedAt.isNaN()) {
            activeStartedAt = elapsedSeconds
            nextAdvanceAt = elapsedSeconds + durationSeconds
        }
        val selectedAsset =
            settings.selectedAnimationAsset.takeIf(animators::containsKey)
        if (
            !settings.animationShuffle &&
            reactionEndsAt.isNaN() &&
            selectedAsset != null &&
            selectedAsset != activeAsset
        ) {
            switchTo(selectedAsset, elapsedSeconds)
            nextAdvanceAt = elapsedSeconds + durationSeconds
        }
        if (lastGenerating && !isGenerating) {
            EMOTION_ANIMATION[emotion]?.takeIf(animators::containsKey)?.let { asset ->
                switchTo(asset, elapsedSeconds)
                reactionEndsAt =
                    elapsedSeconds +
                        minOf(
                            animators.getValue(asset).durationSeconds.toDouble() /
                                settings.animationSpeed.coerceIn(0.1f, 3f),
                            durationSeconds,
                        )
            }
        }
        lastGenerating = isGenerating

        if (!reactionEndsAt.isNaN() && elapsedSeconds >= reactionEndsAt) {
            reactionEndsAt = Double.NaN
            switchTo(
                if (settings.animationShuffle) {
                    nextAmbient()
                } else {
                    selectedAsset ?: activeAsset
                },
                elapsedSeconds,
            )
            nextAdvanceAt = elapsedSeconds + durationSeconds
        } else if (reactionEndsAt.isNaN() && elapsedSeconds >= nextAdvanceAt) {
            if (settings.animationShuffle) {
                switchTo(nextAmbient(), elapsedSeconds)
            } else if (settings.animationLoop) {
                activeStartedAt = elapsedSeconds
            }
            nextAdvanceAt = elapsedSeconds + durationSeconds
        }
        val transitionProgress =
            if (transitionStartedAt.isNaN()) {
                1f
            } else {
                ((elapsedSeconds - transitionStartedAt) / ANIMATION_CROSSFADE_SECONDS)
                    .toFloat()
                    .coerceIn(0f, 1f)
            }
        previousPose.clear()
        currentPose.clear()
        if (transitionProgress < 1f) {
            previousAsset?.let { asset ->
                animators[asset]?.writePose(
                    elapsedSeconds =
                        (elapsedSeconds - previousStartedAt) *
                            settings.animationSpeed.coerceIn(0.1f, 3f),
                    output = previousPose,
                )
            }
        } else {
            previousAsset = null
            transitionStartedAt = Double.NaN
        }
        animators[activeAsset]?.writePose(
            elapsedSeconds =
                (elapsedSeconds - activeStartedAt) *
                    settings.animationSpeed.coerceIn(0.1f, 3f),
            output = currentPose,
            loop = settings.animationLoop || settings.animationShuffle,
        )
        restPose.forEach { (node, rest) ->
            val rotation =
                if (transitionProgress < 1f) {
                    blendAnimationBone(
                        previous = previousPose[node],
                        current = currentPose[node],
                        rest = rest,
                        progress = transitionProgress,
                    )
                } else {
                    currentPose[node] ?: rest
                }
            node.quaternion =
                Quaternion(
                    rotation.x,
                    rotation.y,
                    rotation.z,
                    rotation.w,
                )
        }
    }

    private fun switchTo(
        asset: String,
        elapsedSeconds: Double,
    ) {
        if (asset == activeAsset) return
        previousAsset = activeAsset
        previousStartedAt = activeStartedAt
        activeAsset = asset
        activeStartedAt = elapsedSeconds
        transitionStartedAt = elapsedSeconds
    }

    private fun nextAmbient(): String {
        if (bag.isEmpty()) {
            bag += AUTO_PLAY_ANIMATIONS.filter(animators::containsKey).shuffled(random)
            if (bag.size > 1 && bag.first() == activeAsset) {
                val first = bag.removeAt(0)
                bag += first
            }
        }
        return if (bag.isEmpty()) activeAsset else bag.removeAt(0)
    }
}

private data class MorphBinding(
    val node: ModelNode.RenderableNode,
    val weights: FloatArray,
    val expressions: Map<String, List<VrmMorphBind>>,
)

private fun buildMorphBindings(
    modelNode: ModelNode,
    expressionRig: VrmExpressionRig?,
): List<MorphBinding> =
    modelNode.renderableNodes.mapNotNull { node ->
        val names = node.morphTargetNames
        if (names.isEmpty()) return@mapNotNull null
        val nodeName = node.name.orEmpty()
        val exactExpressions =
            expressionRig?.bindingsByTarget?.get(nodeName)
                ?: expressionRig?.bindingsByTarget
                    ?.entries
                    ?.firstOrNull {
                        normalizeMorphName(it.key) == normalizeMorphName(nodeName)
                    }
                    ?.value
                ?: emptyMap()
        MorphBinding(
            node = node,
            weights = FloatArray(names.size),
            expressions = exactExpressions,
        )
    }

private fun applyMorphState(
    bindings: List<MorphBinding>,
    mouth: MouthWeights,
    emotion: String,
    seconds: Double,
    emotionElapsedMillis: Long,
) {
    val blinkWeight = blinkWeight(seconds)
    val expressionEnvelope = facialExpressionEnvelope(emotionElapsedMillis)
    bindings.forEach { binding ->
        binding.weights.fill(0f)
        applyExpression(binding, listOf("aa", "a"), mouth.aa)
        applyExpression(binding, listOf("ih", "i"), mouth.ih)
        applyExpression(binding, listOf("ou", "u"), mouth.ou)
        applyExpression(binding, listOf("ee", "e"), mouth.ee)
        applyExpression(binding, listOf("oh", "o"), mouth.oh)
        applyExpression(binding, listOf("blink"), blinkWeight)
        applyExpression(binding, listOf("blinkleft", "blink_l"), blinkWeight)
        applyExpression(binding, listOf("blinkright", "blink_r"), blinkWeight)
        applyExpression(
            binding,
            EMOTION_EXPRESSION_PRESETS[emotion].orEmpty(),
            FACIAL_EXPRESSION_WEIGHT * expressionEnvelope,
        )
        binding.node.setMorphWeights(binding.weights, 0)
    }
}

internal fun facialExpressionEnvelope(elapsedMillis: Long): Float {
    if (elapsedMillis < 0L || elapsedMillis >= FACIAL_EXPRESSION_DURATION_MS) return 0f
    if (elapsedMillis < FACIAL_EXPRESSION_ATTACK_MS) {
        return elapsedMillis.toFloat() / FACIAL_EXPRESSION_ATTACK_MS
    }
    val releaseStart = FACIAL_EXPRESSION_DURATION_MS - FACIAL_EXPRESSION_RELEASE_MS
    if (elapsedMillis <= releaseStart) return 1f
    return (
        1f -
            (elapsedMillis - releaseStart).toFloat() /
            FACIAL_EXPRESSION_RELEASE_MS
    ).coerceIn(0f, 1f)
}

private fun applyExpression(
    binding: MorphBinding,
    expressionNames: List<String>,
    value: Float,
) {
    if (value <= 0f) return
    val binds =
        expressionNames.firstNotNullOfOrNull { name ->
            binding.expressions[name.lowercase()]?.takeIf { it.isNotEmpty() }
        }.orEmpty()
    binds.forEach { bind ->
        if (bind.index in binding.weights.indices) {
            binding.weights[bind.index] =
                maxOf(
                    binding.weights[bind.index],
                    (bind.weight * value).coerceIn(0f, 1f),
                )
        }
    }
}

private fun blinkWeight(seconds: Double): Float {
    val phase = (seconds % BLINK_INTERVAL_SECONDS).toFloat()
    if (phase >= BLINK_DURATION_SECONDS) return 0f
    val midpoint = BLINK_DURATION_SECONDS / 2f
    return if (phase <= midpoint) phase / midpoint else (BLINK_DURATION_SECONDS - phase) / midpoint
}

private fun normalizeMorphName(value: String): String =
    value.lowercase().filter(Char::isLetterOrDigit)

private class NativeLipSyncRuntime {
    private var previous = MouthWeights()

    fun update(
        state: WaifuUiState,
        seconds: Double,
    ): MouthWeights {
        if (!state.isSpeaking) return reset()
        val settings = state.settings
        val raw = state.mouthWeights
        if (settings.lipSyncMode == LipSyncMode.DIRECT) {
            var scale = DIRECT_GAIN * settings.lipSyncGain
            val loudness = raw.energy.coerceIn(0f, 1f)
            if (settings.lipSyncVolumeInfluence != 1f && loudness > 0.0001f) {
                scale *= applyVolumeInfluence(loudness, settings) / loudness
            }
            val interpolation = 1f - settings.lipSyncSmoothing
            previous =
                MouthWeights(
                    aa = lerp(previous.aa, (raw.aa * scale).coerceIn(0f, 1f), interpolation),
                    ih = lerp(previous.ih, (raw.ih * scale).coerceIn(0f, 1f), interpolation),
                    ou = lerp(previous.ou, (raw.ou * scale).coerceIn(0f, 1f), interpolation),
                    ee = lerp(previous.ee, (raw.ee * scale).coerceIn(0f, 1f), interpolation),
                    oh = lerp(previous.oh, (raw.oh * scale).coerceIn(0f, 1f), interpolation),
                )
            return previous
        }

        val rawAmplitude = state.speechAmplitude
        val energy = raw.energy
        if (rawAmplitude <= 0.01f && energy <= 0.02f) return reset()
        val amplitude = applyVolumeInfluence(rawAmplitude, settings)
        var target = MouthWeights()

        if (energy > 0.02f) {
            val inverseTotal = if (energy > 0.00001f) 1f / energy else 0f
            val loudness = applyVolumeInfluence(energy.coerceIn(0f, 1f), settings)
            var aa = raw.aa * inverseTotal * loudness * 1.45f * PHONEME_GAIN + amplitude * 0.1f
            var ih = raw.ih * inverseTotal * loudness * 1.2f * PHONEME_GAIN
            var ou = raw.ou * inverseTotal * loudness * 1.15f * PHONEME_GAIN
            var ee = raw.ee * inverseTotal * loudness * 1.25f * PHONEME_GAIN
            val oEnergy = raw.oh * inverseTotal * loudness
            val compressedO = oEnergy.coerceIn(0f, 1f).toDouble().pow(1.2).toFloat()
            var oh = compressedO * 0.34f * PHONEME_GAIN
            ou += compressedO * 0.24f
            aa *= 1f - compressedO * 0.16f

            val bands = state.frequencyBands
            val blend = 0.06f
            aa += bands.low * amplitude * blend
            oh += (bands.low * 0.16f + bands.midLow * 0.1f) * amplitude * blend
            ih += bands.midLow * amplitude * blend * 0.6f
            ee += bands.midHigh * amplitude * blend * 0.65f
            ou += (bands.midHigh * 0.45f + bands.low * 0.2f) * amplitude * blend * 0.65f
            target =
                MouthWeights(
                    aa = min(aa, 0.95f),
                    ih = min(ih, 0.72f),
                    ou = min(ou, 0.7f),
                    ee = min(ee, 0.75f),
                    oh = min(oh, 0.36f),
                )
        } else {
            val bands = state.frequencyBands
            val total = bands.low + bands.midLow + bands.midHigh + bands.high
            target =
                if (total > 0.05f) {
                    val low = bands.low / total
                    val midLow = bands.midLow / total
                    val midHigh = bands.midHigh / total
                    val high = bands.high / total
                    var aa = min(low * 1.4f * amplitude * 2f, 1f)
                    var oh = min((low * 0.35f + midLow * 0.2f) * amplitude * 1.3f, 0.38f)
                    var ih = min((midLow * 0.8f + high * 0.4f) * amplitude * 1.6f, 0.7f)
                    var ee = min(midHigh * 1.2f * amplitude * 1.8f, 0.7f)
                    var ou =
                        min(
                            (midHigh * 0.62f + low * 0.28f) * amplitude * 1.45f + oh * 0.28f,
                            0.68f,
                        )
                    val cycle = sin(seconds * 4.2) * 0.5 + 0.5
                    when {
                        cycle < 0.2 -> aa *= 1.08f
                        cycle < 0.4 -> ih += amplitude * 0.05f
                        cycle < 0.6 -> ou += amplitude * 0.05f
                        cycle < 0.8 -> ee += amplitude * 0.05f
                        else -> oh += amplitude * 0.03f
                    }
                    if (aa + ih + ou + ee + oh < 0.15f) aa = max(amplitude * 0.5f, 0.15f)
                    MouthWeights(aa, ih, ou, ee, oh)
                } else {
                    MouthWeights(aa = amplitude * 0.3f)
                }
        }

        if (target.oh > 0f) {
            val softened = target.oh.coerceIn(0f, 1f).toDouble().pow(1.2).toFloat()
            var oh = min(softened, 0.3f + amplitude * 0.14f)
            var ou = min(target.ou + oh * 0.34f, 0.74f)
            var aa = target.aa * (1f - oh * 0.18f)
            val ee = target.ee * (1f - oh * 0.45f)
            val roundTotal = oh + ou
            val roundCap = 0.62f + amplitude * 0.12f
            if (roundTotal > roundCap) {
                val scale = roundCap / roundTotal
                oh *= scale
                ou *= scale
            }
            target = target.copy(aa = aa, ou = ou, ee = ee, oh = oh)
        }

        val closeSource = max(rawAmplitude, energy * 0.72f)
        val closeGate =
            ((closeSource - CLOSE_GATE_START) / (CLOSE_GATE_END - CLOSE_GATE_START))
                .coerceIn(0f, 1f)
        val masterGain = closeGate * settings.lipSyncGain
        target =
            MouthWeights(
                aa = (target.aa * masterGain).coerceIn(0f, 1f),
                ih = (target.ih * masterGain).coerceIn(0f, 1f),
                ou = (target.ou * masterGain).coerceIn(0f, 1f),
                ee = (target.ee * masterGain).coerceIn(0f, 1f),
                oh = (target.oh * masterGain).coerceIn(0f, 1f),
            )
        previous =
            MouthWeights(
                aa = smooth(previous.aa, target.aa, settings),
                ih = smooth(previous.ih, target.ih, settings),
                ou = smooth(previous.ou, target.ou, settings),
                ee = smooth(previous.ee, target.ee, settings),
                oh = smooth(previous.oh, target.oh, settings),
            )
        return previous
    }

    private fun reset(): MouthWeights {
        previous = MouthWeights()
        return previous
    }

    private fun smooth(
        old: Float,
        target: Float,
        settings: AppSettings,
    ): Float {
        val smoothing =
            if (target < old) {
                settings.lipSyncSmoothing * CLOSE_SMOOTHING_RATIO
            } else {
                settings.lipSyncSmoothing
            }
        val value = old + (target - old) * (1f - smoothing)
        return if (value <= VISEME_DEADZONE) {
            0f
        } else {
            ((value - VISEME_DEADZONE) / (1f - VISEME_DEADZONE)).coerceIn(0f, 1f)
        }
    }

    private fun applyVolumeInfluence(
        amplitude: Float,
        settings: AppSettings,
    ): Float {
        if (settings.lipSyncVolumeInfluence == 1f) return amplitude
        val clamped = amplitude.coerceIn(0f, 1f)
        if (clamped <= 0f) return 0f
        return clamped.toDouble()
            .pow(max(settings.lipSyncVolumeInfluence, 0.05f).toDouble())
            .toFloat()
    }

    private fun lerp(
        from: Float,
        to: Float,
        amount: Float,
    ): Float = from + (to - from) * amount
}

private const val DEFAULT_BUNDLED_VRM_ID = "neuro-sama"
private const val VRM_BASE_VERTICAL_OFFSET = 0.5f
// SceneView loads the raw VRM0 scene root. Unlike three-vrm's normalized scene, applying
// Waifu4's browser -0.62 offset here pushes the avatar below the native viewport.
private const val DEFAULT_MODEL_VERTICAL_OFFSET = 0f
private const val IDLE_BOB_RADIANS_PER_SECOND = PI * 2.0 / 2.6
private const val BLINK_INTERVAL_SECONDS = 4.2
private const val BLINK_DURATION_SECONDS = 0.18f
private const val FACIAL_EXPRESSION_WEIGHT = 0.58f
private const val FACIAL_EXPRESSION_ATTACK_MS = 140L
private const val FACIAL_EXPRESSION_DURATION_MS = 3_200L
private const val FACIAL_EXPRESSION_RELEASE_MS = 900L
private const val PHONEME_GAIN = 0.39f
private const val VISEME_DEADZONE = 0.045f
private const val CLOSE_GATE_START = 0.035f
private const val CLOSE_GATE_END = 0.16f
private const val CLOSE_SMOOTHING_RATIO = 0.36f
private const val DIRECT_GAIN = 0.9f
private const val DEFAULT_ANIMATION_DURATION_SECONDS = 10.0
private const val ANIMATION_CROSSFADE_SECONDS = 1.0

private const val SACHI_ANIMATION_DIR = "animations/sachi-vrma"
private val AUTO_PLAY_ANIMATIONS =
    BUNDLED_ANIMATION_CLIPS.filter { it.safeAutoplay }.map { it.assetPath }
private const val HAPPY_ANIMATION =
    "$SACHI_ANIMATION_DIR/CC0animationhappy01.vrma"
private const val SMALL_WAVE_ANIMATION =
    "$SACHI_ANIMATION_DIR/CC0animationsmallwve.vrma"
private const val WAVE_ANIMATION =
    "$SACHI_ANIMATION_DIR/CC0animationwave01.vrma"
private val NATIVE_ENABLED_ANIMATIONS =
    (AUTO_PLAY_ANIMATIONS + HAPPY_ANIMATION + SMALL_WAVE_ANIMATION + WAVE_ANIMATION).distinct()
private val EMOTION_ANIMATION =
    mapOf(
        "happy" to HAPPY_ANIMATION,
        "amused" to HAPPY_ANIMATION,
    )

private val EMOTION_EXPRESSION_PRESETS =
    mapOf(
        "happy" to listOf("happy", "joy"),
        "amused" to listOf("happy", "joy"),
        "affectionate" to listOf("relaxed", "happy", "joy"),
        "sad" to listOf("sad", "sorrow"),
        "angry" to listOf("angry"),
        "annoyed" to listOf("angry"),
        "surprised" to listOf("surprised"),
        "curious" to listOf("relaxed"),
    )
