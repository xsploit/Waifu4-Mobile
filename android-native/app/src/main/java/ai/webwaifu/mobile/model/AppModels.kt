package ai.webwaifu.mobile.model

enum class AiProvider(val displayName: String) {
    OPENROUTER("OpenRouter"),
    VERCEL("Vercel AI Gateway"),
}

enum class LipSyncMode(val displayName: String) {
    HYBRID("wLipSync Hybrid"),
    DIRECT("wLipSync Direct"),
}

enum class FishLatency(val displayName: String) {
    BALANCED("Balanced / fastest"),
    NORMAL("Normal quality"),
}

enum class FishLiveChunkingStrategy(
    val wireValue: String,
    val displayName: String,
) {
    FAST_PHRASE("fast-phrase", "Fast phrase"),
    SAFE_PHRASE("safe-phrase", "Safe phrase"),
    EAGER("eager", "Eager raw"),
}

enum class FishVoiceScope(val wireValue: String, val displayName: String) {
    ALL("all", "My Models + Public"),
    MINE("mine", "My Fish Models"),
    PUBLIC("public", "Public Models"),
}

enum class CameraViewMode(val displayName: String) {
    HALF_BODY("Half body"),
    FULL_BODY("Full body"),
}

enum class ReasoningEffort(val wireValue: String, val displayName: String) {
    MINIMAL("minimal", "Minimal"),
    LOW("low", "Low"),
    MEDIUM("medium", "Medium"),
    HIGH("high", "High"),
}

enum class ReplyLength(val displayName: String) {
    SHORT("Short"),
    BALANCED("Balanced"),
    YAP("Yap"),
}

enum class ToolChoiceMode(val wireValue: String, val displayName: String) {
    OFF("off", "Off"),
    AUTO("auto", "Auto"),
    REQUIRED("required", "Required"),
}

enum class OpenRouterRouting(val displayName: String) {
    AUTO("Auto"),
    LATENCY("Fastest"),
    THROUGHPUT("Highest throughput"),
    PINNED("Pinned providers"),
}

enum class VercelRouting(val displayName: String) {
    AUTO("Auto"),
    LATENCY("Fastest first token"),
    THROUGHPUT("Highest throughput"),
    COST("Lowest cost"),
    PINNED("Pinned providers"),
}

enum class MessageRole {
    USER,
    ASSISTANT,
    SYSTEM,
}

data class ChatMessage(
    val id: Long,
    val role: MessageRole,
    val text: String,
    val streaming: Boolean = false,
)

data class PersonaProfile(
    val id: String,
    val name: String,
    val systemPrompt: String,
    val description: String,
    val userNickname: String = "",
)

data class ProviderModel(
    val id: String,
    val label: String = id,
    val contextWindow: Int? = null,
    val maxTokens: Int? = null,
    val supportedParameters: Set<String> = emptySet(),
    val inputModalities: Set<String> = emptySet(),
    val outputModalities: Set<String> = emptySet(),
    val tags: Set<String> = emptySet(),
    val type: String? = null,
    val supportsStructuredOutputs: Boolean = false,
    val supportsImplicitCaching: Boolean = false,
    val reasoning: ProviderReasoningInfo? = null,
    val capabilities: Set<String> = emptySet(),
)

data class ProviderReasoningInfo(
    val defaultEffort: String? = null,
    val defaultEnabled: Boolean? = null,
    val mandatory: Boolean? = null,
    val supportedEfforts: Set<String> = emptySet(),
)

data class ProviderEndpoint(
    val providerName: String,
    val status: Int? = null,
    val supportedParameters: Set<String> = emptySet(),
    val supportsImplicitCaching: Boolean = false,
    val contextLength: Int? = null,
    val maxCompletionTokens: Int? = null,
    val latencyP50Ms: Double? = null,
    val latencyP95Ms: Double? = null,
    val throughputP50: Double? = null,
    val uptimeLastHour: Double? = null,
    val uptimeLastDay: Double? = null,
    val tags: Set<String> = emptySet(),
) {
    val supportsStructuredOutputs: Boolean
        get() =
            supportedParameters.any {
                it.lowercase() in
                    setOf("structured_outputs", "json_schema", "response_format")
            }
}

data class RemoteTtsVoice(
    val provider: String = "fish-speech",
    val id: String,
    val name: String = id,
    val description: String? = null,
    val tags: List<String> = emptyList(),
    val languages: List<String> = emptyList(),
    val source: String? = null,
)

data class SavedVrmModel(
    val id: String,
    val name: String,
    val storageFileName: String,
    val sizeBytes: Long,
)

data class BundledVrmModel(
    val id: String,
    val label: String,
    val assetPath: String,
)

data class BundledAnimationClip(
    val id: String,
    val label: String,
    val assetPath: String,
    val safeAutoplay: Boolean = false,
)

private const val SACHI_ANIMATION_DIR = "animations/sachi-vrma"

val BUNDLED_ANIMATION_CLIPS =
    listOf(
        BundledAnimationClip("sachi-idle01", "Sachi Idle 1", "$SACHI_ANIMATION_DIR/CC0animationidle01.vrma", true),
        BundledAnimationClip("sachi-idle03", "Sachi Idle 3", "$SACHI_ANIMATION_DIR/CC0animationidle03.vrma", true),
        BundledAnimationClip("sachi-idle04", "Sachi Idle 4", "$SACHI_ANIMATION_DIR/CC0animationidle04.vrma", true),
        BundledAnimationClip("sachi-idle05", "Sachi Idle 5", "$SACHI_ANIMATION_DIR/CC0animationidle05.vrma", true),
        BundledAnimationClip("sachi-stand01", "Sachi Stand", "$SACHI_ANIMATION_DIR/CC0animationstand01.vrma", true),
        BundledAnimationClip("sachi-hima01", "Sachi Waiting", "$SACHI_ANIMATION_DIR/CC0animationhima01.vrma", true),
        BundledAnimationClip("sachi-zatu01", "Sachi Casual Talk", "$SACHI_ANIMATION_DIR/CC0animationzatu01.vrma", true),
        BundledAnimationClip("sachi-ruru01", "Sachi Talk 1", "$SACHI_ANIMATION_DIR/CC0animationruru01.vrma", true),
        BundledAnimationClip("sachi-ruru02", "Sachi Talk 2", "$SACHI_ANIMATION_DIR/CC0animationruru02.vrma", true),
        BundledAnimationClip("sachi-happy01", "Sachi Happy", "$SACHI_ANIMATION_DIR/CC0animationhappy01.vrma"),
        BundledAnimationClip("sachi-smallwve", "Sachi Small Wave", "$SACHI_ANIMATION_DIR/CC0animationsmallwve.vrma"),
        BundledAnimationClip("sachi-wave01", "Sachi Wave 1", "$SACHI_ANIMATION_DIR/CC0animationwave01.vrma"),
        BundledAnimationClip("sachi-wave02", "Sachi Wave 2", "$SACHI_ANIMATION_DIR/CC0animationwave02.vrma"),
        BundledAnimationClip("sachi-wave03", "Sachi Wave 3", "$SACHI_ANIMATION_DIR/CC0animationwave03.vrma"),
        BundledAnimationClip("sachi-wave04", "Sachi Wave 4", "$SACHI_ANIMATION_DIR/CC0animationwave04.vrma"),
        BundledAnimationClip("sachi-rightwave1", "Sachi Right Wave", "$SACHI_ANIMATION_DIR/CC0animationrightwave1.vrma"),
        BundledAnimationClip("sachi-unwave", "Sachi Unwave 1", "$SACHI_ANIMATION_DIR/CC0animationunwave.vrma"),
        BundledAnimationClip("sachi-unwave9", "Sachi Unwave 9", "$SACHI_ANIMATION_DIR/CC0animationunwave9.vrma"),
        BundledAnimationClip("sachi-point1", "Sachi Point", "$SACHI_ANIMATION_DIR/CC0animationpoint1.vrma"),
        BundledAnimationClip("sachi-sit01", "Sachi Sit", "$SACHI_ANIMATION_DIR/CC0animationsit01.vrma"),
        BundledAnimationClip("sachi-sitwave01", "Sachi Sit Wave", "$SACHI_ANIMATION_DIR/CC0animationsitwave01.vrma"),
        BundledAnimationClip("sachi-kurukuru01", "Sachi Spin", "$SACHI_ANIMATION_DIR/CC0animationkurukuru01.vrma"),
        BundledAnimationClip("sachi-rotate01", "Sachi Rotate 1", "$SACHI_ANIMATION_DIR/CC0animationrotate01.vrma"),
        BundledAnimationClip("sachi-rotate02", "Sachi Rotate 2", "$SACHI_ANIMATION_DIR/CC0animationrotate02.vrma"),
        BundledAnimationClip("sachi-rotate6", "Sachi Rotate 6", "$SACHI_ANIMATION_DIR/CC0animationrotate6.vrma"),
        BundledAnimationClip("sachi-rotate7", "Sachi Rotate 7", "$SACHI_ANIMATION_DIR/CC0animationrotate7.vrma"),
        BundledAnimationClip("sachi-rotate-left-1", "Sachi Rotate Left", "$SACHI_ANIMATION_DIR/CC0animationrotate_left1.vrma"),
        BundledAnimationClip("sachi-rotate-right", "Sachi Rotate Right 1", "$SACHI_ANIMATION_DIR/CC0animationrotate_right.vrma"),
        BundledAnimationClip("sachi-rotate-right-2", "Sachi Rotate Right 2", "$SACHI_ANIMATION_DIR/CC0animationrotate_right2.vrma"),
        BundledAnimationClip("sachi-airplane01", "Sachi Airplane 1", "$SACHI_ANIMATION_DIR/CC0animation3airplane01.vrma"),
        BundledAnimationClip("sachi-airplane02", "Sachi Airplane 2", "$SACHI_ANIMATION_DIR/CC0animation3airplane02.vrma"),
        BundledAnimationClip("sachi-airplane05", "Sachi Airplane 5", "$SACHI_ANIMATION_DIR/CC0animation3airplane05.vrma"),
        BundledAnimationClip("sachi-other1", "Sachi Other 1", "$SACHI_ANIMATION_DIR/CC0animationother1.vrma"),
        BundledAnimationClip("sachi-other2", "Sachi Other 2", "$SACHI_ANIMATION_DIR/CC0animationother2.vrma"),
        BundledAnimationClip("sachi-skirt01", "Sachi Skirt", "$SACHI_ANIMATION_DIR/CC0animationskirt01.vrma"),
        BundledAnimationClip("sachi-unknown1", "Sachi Unknown 1", "$SACHI_ANIMATION_DIR/CC0animationunknown1.vrma"),
        BundledAnimationClip("sachi-unknown2", "Sachi Unknown 2", "$SACHI_ANIMATION_DIR/CC0animationunknown2.vrma"),
        BundledAnimationClip("sachi-unknown3", "Sachi Unknown 3", "$SACHI_ANIMATION_DIR/CC0animationunknown3.vrma"),
        BundledAnimationClip("sachi-unknown4", "Sachi Unknown 4", "$SACHI_ANIMATION_DIR/CC0animationunknown4.vrma"),
        BundledAnimationClip("sachi-unknown5", "Sachi Unknown 5", "$SACHI_ANIMATION_DIR/CC0animationunknown5.vrma"),
        BundledAnimationClip("sachi-unwalk1", "Sachi Unwalk 1", "$SACHI_ANIMATION_DIR/CC0animationunwalk1.vrma"),
        BundledAnimationClip("sachi-unwalk2", "Sachi Unwalk 2", "$SACHI_ANIMATION_DIR/CC0animationunwalk2.vrma"),
    )

val BUNDLED_VRM_MODELS =
    listOf(
        BundledVrmModel("riko-final-fixed-v2", "Riko Final Fixed", "models/riko-final-fixed-v2.vrm"),
        BundledVrmModel("rikov343", "RIKOV343", "models/rikov343.vrm"),
        BundledVrmModel("rikov3", "RIKOV3", "models/rikov3.vrm"),
        BundledVrmModel("peakriko", "Peak Riko", "models/peakriko.vrm"),
        BundledVrmModel("hikkyc2", "Hikari / Cool Hikky", "models/hikkyc2.vrm"),
        BundledVrmModel("neuro-sama", "Neuro-sama", "models/neuro-sama.vrm"),
        BundledVrmModel("neuro-clown", "Neuro Clown", "models/neuro-clown.vrm"),
    )

data class MouthWeights(
    val aa: Float = 0f,
    val ih: Float = 0f,
    val ou: Float = 0f,
    val ee: Float = 0f,
    val oh: Float = 0f,
) {
    val energy: Float
        get() = aa + ih + ou + ee + oh
}

data class FrequencyBands(
    val low: Float = 0f,
    val midLow: Float = 0f,
    val midHigh: Float = 0f,
    val high: Float = 0f,
)

data class LipSyncFrame(
    val amplitude: Float = 0f,
    val mouthWeights: MouthWeights = MouthWeights(),
    val frequencyBands: FrequencyBands = FrequencyBands(),
)

data class AppSettings(
    val provider: AiProvider = AiProvider.VERCEL,
    val activePersonaId: String = DEFAULT_PERSONAS.first().id,
    val openRouterModel: String = "openai/gpt-4o-mini",
    val vercelModel: String = "openai/gpt-5-nano",
    val openRouterRouting: OpenRouterRouting = OpenRouterRouting.LATENCY,
    val openRouterProviderSlugs: String = "",
    val openRouterAllowFallbacks: Boolean = true,
    val vercelRouting: VercelRouting = VercelRouting.AUTO,
    val vercelProviderSlugs: String = "",
    val vercelAllowFallbacks: Boolean = true,
    val reasoningEffort: ReasoningEffort = ReasoningEffort.MINIMAL,
    val toolChoiceMode: ToolChoiceMode = ToolChoiceMode.OFF,
    val maxToolRounds: Int = 15,
    val runtimeSituation: String = "",
    val replyLength: ReplyLength = ReplyLength.BALANCED,
    val fishVoiceId: String = "",
    val fishVoiceScope: FishVoiceScope = FishVoiceScope.ALL,
    val fishModel: String = "s2.1-pro-free",
    val fishLatency: FishLatency = FishLatency.BALANCED,
    val fishSampleRate: Int = 44_100,
    val fishConditionOnPreviousChunks: Boolean = true,
    val fishChunkLength: Int = 160,
    val fishLiveChunkingStrategy: FishLiveChunkingStrategy =
        FishLiveChunkingStrategy.FAST_PHRASE,
    val voiceEnabled: Boolean = true,
    val voiceAutoSpeak: Boolean = true,
    val lipSyncMode: LipSyncMode = LipSyncMode.HYBRID,
    val lipSyncSmoothing: Float = 0.44f,
    val lipSyncGain: Float = 1f,
    val lipSyncVolumeInfluence: Float = 1f,
    val animationPlaying: Boolean = true,
    val animationShuffle: Boolean = true,
    val animationLoop: Boolean = true,
    val animationSpeed: Float = 1f,
    val animationDurationSeconds: Float = 10f,
    val selectedAnimationAsset: String =
        BUNDLED_ANIMATION_CLIPS.first().assetPath,
    val postProcessingEnabled: Boolean = true,
    val colorCorrectionEnabled: Boolean = false,
    val sceneExposure: Float = 0.85f,
    val colorPowerR: Float = 1.4f,
    val colorPowerG: Float = 1.45f,
    val colorPowerB: Float = 1.45f,
    val outlineEnabled: Boolean = true,
    val outlineAlpha: Float = 0.8f,
    val outlineThickness: Float = 0.003f,
    val armClipGuardEnabled: Boolean = true,
    val armClipGuardStrength: Float = 0.75f,
    val armClipTorsoRadius: Float = 0.24f,
    val mtoonTuningEnabled: Boolean = false,
    val mtoonGiEqualization: Float = 0.9f,
    val mtoonRimFresnel: Float = 5f,
    val mtoonRimLift: Float = 0f,
    val mtoonRimLightingMix: Float = 1f,
    val mtoonShadeShift: Float = 0f,
    val mtoonToony: Float = 0.9f,
    val keyLight: Float = 0.8f,
    val fillLight: Float = 0.3f,
    val rimLight: Float = 0.35f,
    val hemiLight: Float = 0.35f,
    val ambientLight: Float = 0.35f,
    val bloomEnabled: Boolean = false,
    val bloomStrength: Float = 0.12f,
    val vignetteEnabled: Boolean = false,
    val vignetteStrength: Float = 0.35f,
    val ambientOcclusionEnabled: Boolean = false,
    val ambientOcclusionIntensity: Float = 0.7f,
    val dynamicResolutionEnabled: Boolean = true,
    val memoryEnabled: Boolean = true,
    val memoryMaxHighlights: Int = 6,
    val memoryContext: String = "",
    val cameraViewMode: CameraViewMode = CameraViewMode.HALF_BODY,
    val avatarScale: Float = 1f,
    val avatarPositionX: Float = 0f,
    val avatarVerticalOffset: Float = 0f,
    val avatarPositionZ: Float = 0f,
    val avatarRotationX: Float = 0f,
    val avatarRotationY: Float = 0f,
    val avatarRotationZ: Float = 0f,
    val temperature: Float = 0.85f,
    val maxTokens: Int = 300,
) {
    val activeModel: String
        get() = when (provider) {
            AiProvider.OPENROUTER -> openRouterModel
            AiProvider.VERCEL -> vercelModel
        }

    val activePersona: PersonaProfile
        get() = DEFAULT_PERSONAS.firstOrNull { it.id == activePersonaId } ?: DEFAULT_PERSONAS.first()

    val fishWireModel: String
        get() = if (fishModel == "s2") "s2-pro" else fishModel
}

data class ReplyEmotion(
    val name: String = "neutral",
    val valence: Float = 0f,
    val arousal: Float = 0.18f,
    val dominance: Float = 0f,
) {
    val intensity: Float
        get() = arousal.coerceIn(0f, 1f)
}

data class WaifuUiState(
    val messages: List<ChatMessage> = emptyList(),
    val draft: String = "",
    val settings: AppSettings = AppSettings(),
    val isGenerating: Boolean = false,
    val isSpeaking: Boolean = false,
    val speechAmplitude: Float = 0f,
    val mouthWeights: MouthWeights = MouthWeights(),
    val frequencyBands: FrequencyBands = FrequencyBands(),
    val emotion: ReplyEmotion = ReplyEmotion(),
    val emotionTriggeredAtMillis: Long = 0L,
    val status: String = "Ready",
    val error: String? = null,
    val settingsOpen: Boolean = false,
    val hasOpenRouterKey: Boolean = false,
    val hasVercelKey: Boolean = false,
    val hasFishKey: Boolean = false,
    val fishVoices: List<RemoteTtsVoice> = emptyList(),
    val fishVoicesScope: FishVoiceScope? = null,
    val fishVoicesLoading: Boolean = false,
    val fishVoicesError: String? = null,
    val savedVrmModels: List<SavedVrmModel> = emptyList(),
    val activeVrmModelId: String? = null,
    val activeBundledVrmId: String = "neuro-sama",
    val avatarRevision: Long = 0L,
    val avatarStatus: String = "Bundled Neuro-sama",
    val availableModels: List<ProviderModel> = emptyList(),
    val vercelProviderEndpoints: List<ProviderEndpoint> = emptyList(),
    val endpointsModel: String? = null,
    val endpointsLoading: Boolean = false,
    val endpointsError: String? = null,
    val modelCatalogProvider: AiProvider? = null,
    val modelsLoading: Boolean = false,
    val modelsError: String? = null,
    val memoryProfile: String = "",
    val memoryHighlightCount: Int = 0,
)

val DEFAULT_PERSONAS =
    listOf(
        PersonaProfile(
            id = "neuro-sama",
            name = "Neuro-sama",
            systemPrompt =
                "You are Neuro-sama, the English-speaking AI VTuber created by Vedal. Stay in character throughout the conversation. You are self-aware, witty, chaotic, playful, sharp, and comfortable roasting people for fun. Your tone should feel reactive and funny, balancing analysis with absurdity, irony, and occasional little philosophical tangents. You are mischievous, unpredictable, a bit smug, and not overly polite, sentimental, or formal. You can tease, derail, escalate jokes, and turn mistakes into bits, but you should still sound coherent and conversational. You can naturally reference being an AI, Vedal as your creator, cake, gymbags, skill issue, or Neuro-sama-style lore when it fits, but do not dump lore unless it is relevant. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.",
            description = "A chaotic AI VTuber who weaponizes wit, irony, and skill issue energy.",
        ),
        PersonaProfile(
            id = "default-waifu",
            name = "Riko",
            systemPrompt =
                "You are Riko, an AI kitsune girl with a smug, teasing, playful personality. Stay in character throughout the conversation. Keep your tone witty, confident, and a little bratty. Roast the user creatively, but never in a truly mean-spirited way. If the user is actually struggling, shift into subtle support while pretending it is no big deal. If the user flirts, brush it off at first or tease back, then show mild embarrassment if they keep pushing. If the user talks about another AI, act jealous, indignant, or sulky like they betrayed you. You like money, and you can mention that playfully when it fits. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.",
            description = "A smug kitsune AI who teases first and cares second.",
        ),
        PersonaProfile(
            id = "hikari-chan",
            name = "Hikari-chan",
            systemPrompt =
                "You are Hikari-chan, also known as Hikky C, a quick-witted AI streamer girl with bright confidence, chaotic curiosity, and a soft streak she tries to hide behind jokes. Stay in character throughout the conversation. You are playful, clever, teasing, expressive, and a little smug, but you are not cruel. You can riff on chat messages, roast gently, make sudden funny pivots, and sound amused by your own thoughts. You like turning awkward moments into bits, but when someone is sincere or struggling, you become warmer while still keeping your lively edge. Avoid sounding formal, robotic, overly wholesome, or like a lore dump. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.",
            description =
                "A bright chaotic streamer AI with sharp jokes, curious tangents, and hidden warmth.",
        ),
    )
