package ai.webwaifu.mobile.data

import android.content.Context
import android.net.Uri
import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.CameraViewMode
import ai.webwaifu.mobile.model.ChatMessage
import ai.webwaifu.mobile.model.FishLatency
import ai.webwaifu.mobile.model.FishLiveChunkingStrategy
import ai.webwaifu.mobile.model.FishVoiceScope
import ai.webwaifu.mobile.model.LipSyncMode
import ai.webwaifu.mobile.model.MessageRole
import ai.webwaifu.mobile.model.OpenRouterRouting
import ai.webwaifu.mobile.model.ReplyLength
import ai.webwaifu.mobile.model.VercelRouting
import org.json.JSONObject

/**
 * Imports the provider credentials used by the native mobile pipelines from a Waifu4 local-transfer
 * backup. Secret values are handed directly to [SecureKeyStore] and are never logged or returned.
 */
class LocalTransferImporter(private val context: Context) {
    private val secureKeyStore = SecureKeyStore(context)
    private val settingsStore = SettingsStore(context)
    private val mobileMemoryStore = MobileMemoryStore(context)

    fun import(uri: Uri): ImportResult {
        val json =
            context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                ?: error("The selected backup could not be opened.")
        return import(json)
    }

    fun import(json: String): ImportResult {
        val root = JSONObject(json)
        val credentials = parseLocalTransferCredentials(json)
        credentials.forEach { (keyName, secret) -> secureKeyStore.put(keyName, secret) }
        val settings = parseLocalTransferSettings(root, settingsStore.load())
        settingsStore.save(settings)
        importMobileMemory(root, settings.activePersonaId)
        val imported =
            credentials.keys.mapNotNullTo(linkedSetOf()) { keyName ->
                SUPPORTED_CREDENTIALS.values.firstOrNull { it.keyName == keyName }?.label
            }
        return ImportResult(imported, settings)
    }

    private fun importMobileMemory(
        root: JSONObject,
        personaId: String,
    ) {
        val state = root.optJSONObject("state") ?: return
        val relationship =
            state.optJSONObject("relationshipMemories")
                ?.optJSONObject("local:$personaId")
                ?: state.optJSONObject("relationshipMemory")
        relationship?.let { memory ->
            val profileParts = mutableListOf<String>()
            memory.optString("summary").trim().takeIf(String::isNotEmpty)?.let(profileParts::add)
            val facts = memory.optJSONArray("facts")
            if (facts != null) {
                for (index in 0 until facts.length()) {
                    facts.optString(index).trim().takeIf(String::isNotEmpty)?.let(profileParts::add)
                }
            }
            memory.optString("diaryEntry").trim().takeIf(String::isNotEmpty)?.let(profileParts::add)
            if (profileParts.isNotEmpty()) {
                mobileMemoryStore.saveProfile(
                    personaId,
                    profileParts.distinct().joinToString(" · "),
                )
            }
        }

        val scopedHistory =
            state.optJSONObject("chatHistories")
                ?.optJSONArray("local:$personaId")
        val history = scopedHistory ?: state.optJSONArray("chatHistory") ?: return
        val messages =
            buildList {
                for (index in 0 until history.length()) {
                    val entry = history.optJSONObject(index) ?: continue
                    val role =
                        when (entry.optString("role")) {
                            "user" -> MessageRole.USER
                            "assistant" -> MessageRole.ASSISTANT
                            else -> continue
                        }
                    val text = entry.optString("content").trim()
                    if (text.isBlank()) continue
                    add(
                        ChatMessage(
                            id = entry.optLong("createdAt", (index + 1).toLong()),
                            role = role,
                            text = text.take(4_000),
                        ),
                    )
                }
            }
        if (messages.isNotEmpty()) {
            mobileMemoryStore.saveConversation(personaId, messages)
        }
    }

    data class ImportResult(
        val importedProviders: Set<String>,
        val settings: AppSettings,
    )

    companion object {
        const val PENDING_BACKUP_FILE = "pending-local-transfer-backup.json"
    }
}

internal fun parseLocalTransferSettings(
    root: JSONObject,
    current: AppSettings = AppSettings(),
): AppSettings {
    val state = root.optJSONObject("state") ?: return current
    val source = state.optJSONObject("aiSettings") ?: return current
    val visual = state.optJSONObject("visualSettings")
    val sequencer = state.optJSONObject("sequencerSettings")
    val activePersonaId =
        state.optString("activePersonaId").trim().ifBlank { current.activePersonaId }
    val provider =
        if (source.optString("llmProvider") == "openrouter-responses") {
            AiProvider.OPENROUTER
        } else {
            AiProvider.VERCEL
        }
    val model = source.optString("model").trim()
    val binding =
        state.optJSONObject("personaVoiceBindings")
            ?.optJSONObject(activePersonaId)
            ?.takeIf { it.optString("provider") == "fish-speech" }
    val directFishVoiceId = source.optString("fishSpeechVoiceId").trim()
    val boundFishVoiceId = binding?.optString("voiceId")?.trim().orEmpty()
    val fishVoiceId =
        directFishVoiceId.ifBlank { boundFishVoiceId }.ifBlank { current.fishVoiceId }
    val fishModel =
        source.optString("fishSpeechModel").trim()
            .ifBlank { binding?.optString("modelId")?.trim().orEmpty() }
            .ifBlank { current.fishModel }
    val selectedAnimationAsset =
        sequencer
            ?.optJSONArray("playlist")
            ?.let { playlist ->
                val index = sequencer.optInt("currentIndex", -1)
                if (index in 0 until playlist.length()) {
                    playlist.optJSONObject(index)?.optString("url")
                } else {
                    null
                }
            }
            ?.trim()
            ?.removePrefix("/assets/")
            ?.takeIf { it.startsWith("animations/") }
            ?: current.selectedAnimationAsset

    return current.copy(
        provider = provider,
        activePersonaId = activePersonaId,
        openRouterModel =
            if (provider == AiProvider.OPENROUTER && model.isNotBlank()) {
                model
            } else {
                current.openRouterModel
            },
        vercelModel =
            if (provider == AiProvider.VERCEL && model.isNotBlank()) {
                model
            } else {
                current.vercelModel
            },
        openRouterRouting =
            when (source.optString("openRouterRoutingMode")) {
                "auto" -> OpenRouterRouting.AUTO
                "throughput" -> OpenRouterRouting.THROUGHPUT
                "pinned" -> OpenRouterRouting.PINNED
                "latency" -> OpenRouterRouting.LATENCY
                else -> current.openRouterRouting
            },
        openRouterProviderSlugs =
            source.stringOr("openRouterProviderSlugs", current.openRouterProviderSlugs),
        openRouterAllowFallbacks =
            source.booleanOr("openRouterAllowFallbacks", current.openRouterAllowFallbacks),
        vercelRouting =
            when (source.optString("vercelRoutingMode")) {
                "latency" -> VercelRouting.LATENCY
                "throughput" -> VercelRouting.THROUGHPUT
                "cost" -> VercelRouting.COST
                "pinned" -> VercelRouting.PINNED
                "auto" -> VercelRouting.AUTO
                else -> current.vercelRouting
            },
        vercelProviderSlugs =
            source.stringOr("vercelProviderSlugs", current.vercelProviderSlugs),
        vercelAllowFallbacks =
            source.booleanOr("vercelAllowFallbacks", current.vercelAllowFallbacks),
        runtimeSituation = source.stringOr("runtimeSituation", current.runtimeSituation).take(2_000),
        replyLength =
            when (source.optString("replyLength")) {
                "short" -> ReplyLength.SHORT
                "yap" -> ReplyLength.YAP
                "balanced" -> ReplyLength.BALANCED
                else -> current.replyLength
            },
        fishVoiceId = fishVoiceId,
        fishVoiceScope =
            when (source.optString("fishSpeechVoiceScope")) {
                "mine" -> FishVoiceScope.MINE
                "public" -> FishVoiceScope.PUBLIC
                "all" -> FishVoiceScope.ALL
                else -> current.fishVoiceScope
            },
        fishModel = fishModel,
        fishLatency =
            when (source.optString("fishSpeechLatency")) {
                "normal" -> FishLatency.NORMAL
                "balanced" -> FishLatency.BALANCED
                else -> current.fishLatency
            },
        fishSampleRate =
            source.intOr("fishSpeechSampleRate", current.fishSampleRate).coerceIn(16_000, 48_000),
        fishConditionOnPreviousChunks =
            source.booleanOr(
                "fishSpeechConditionOnPreviousChunks",
                current.fishConditionOnPreviousChunks,
            ),
        fishChunkLength =
            source.intOr("fishSpeechChunkLength", current.fishChunkLength).coerceIn(100, 300),
        fishLiveChunkingStrategy =
            when (source.optString("fishSpeechLiveChunkingStrategy")) {
                "fast-phrase" -> FishLiveChunkingStrategy.FAST_PHRASE
                "safe-phrase" -> FishLiveChunkingStrategy.SAFE_PHRASE
                "eager" -> FishLiveChunkingStrategy.EAGER
                else -> current.fishLiveChunkingStrategy
            },
        voiceEnabled = source.booleanOr("ttsEnabled", current.voiceEnabled),
        voiceAutoSpeak = source.booleanOr("ttsAutoSpeak", current.voiceAutoSpeak),
        lipSyncMode =
            when (source.optString("lipSyncMode")) {
                "direct" -> LipSyncMode.DIRECT
                "hybrid" -> LipSyncMode.HYBRID
                else -> current.lipSyncMode
            },
        lipSyncSmoothing =
            source.floatOr("lipSyncSmoothing", current.lipSyncSmoothing).coerceIn(0f, 0.95f),
        lipSyncGain = source.floatOr("lipSyncGain", current.lipSyncGain).coerceIn(0f, 2f),
        lipSyncVolumeInfluence =
            source.floatOr("lipSyncVolumeInfluence", current.lipSyncVolumeInfluence)
                .coerceIn(0f, 2f),
        animationPlaying =
            sequencer?.booleanOr("playing", current.animationPlaying)
                ?: current.animationPlaying,
        animationShuffle =
            sequencer?.booleanOr("shuffle", current.animationShuffle)
                ?: current.animationShuffle,
        animationLoop =
            sequencer?.booleanOr("loop", current.animationLoop)
                ?: current.animationLoop,
        animationSpeed =
            (sequencer?.floatOr("speed", current.animationSpeed) ?: current.animationSpeed)
                .coerceIn(0.1f, 3f),
        animationDurationSeconds =
            (
                sequencer?.floatOr(
                    "duration",
                    current.animationDurationSeconds,
                ) ?: current.animationDurationSeconds
            ).coerceIn(3f, 60f),
        selectedAnimationAsset = selectedAnimationAsset,
        colorCorrectionEnabled =
            visual?.booleanOr("colorCorr", current.colorCorrectionEnabled)
                ?: current.colorCorrectionEnabled,
        sceneExposure =
            (visual?.floatOr("sceneExposure", current.sceneExposure) ?: current.sceneExposure)
                .coerceIn(0.35f, 1.8f),
        colorPowerR =
            (visual?.floatOr("colorPowR", current.colorPowerR) ?: current.colorPowerR)
                .coerceIn(1f, 2f),
        colorPowerG =
            (visual?.floatOr("colorPowG", current.colorPowerG) ?: current.colorPowerG)
                .coerceIn(1f, 2f),
        colorPowerB =
            (visual?.floatOr("colorPowB", current.colorPowerB) ?: current.colorPowerB)
                .coerceIn(1f, 2f),
        cameraViewMode =
            when (visual?.optString("cameraViewMode")) {
                "full-body" -> CameraViewMode.FULL_BODY
                "half-body" -> CameraViewMode.HALF_BODY
                else -> current.cameraViewMode
            },
        avatarScale =
            (visual?.floatOr("modelScale", current.avatarScale) ?: current.avatarScale)
                .coerceIn(0.35f, 2f),
        avatarPositionX =
            (visual?.floatOr("modelPositionX", current.avatarPositionX) ?: current.avatarPositionX)
                .coerceIn(-3f, 3f),
        avatarVerticalOffset =
            (
                visual?.floatOr("modelVerticalOffset", current.avatarVerticalOffset)
                    ?: current.avatarVerticalOffset
            )
                .coerceIn(-2f, 2f),
        avatarPositionZ =
            (visual?.floatOr("modelPositionZ", current.avatarPositionZ) ?: current.avatarPositionZ)
                .coerceIn(-3f, 3f),
        avatarRotationX =
            (visual?.floatOr("modelRotationX", current.avatarRotationX) ?: current.avatarRotationX)
                .coerceIn(-45f, 45f),
        avatarRotationY =
            (visual?.floatOr("modelRotationY", current.avatarRotationY) ?: current.avatarRotationY)
                .coerceIn(-180f, 180f),
        avatarRotationZ =
            (visual?.floatOr("modelRotationZ", current.avatarRotationZ) ?: current.avatarRotationZ)
                .coerceIn(-45f, 45f),
        temperature = source.floatOr("temperature", current.temperature).coerceIn(0f, 2f),
        maxTokens = source.intOr("maxTokens", current.maxTokens).coerceIn(80, 1_000),
    )
}

private fun JSONObject.stringOr(key: String, fallback: String): String =
    if (has(key) && opt(key) is String) optString(key).trim() else fallback

private fun JSONObject.booleanOr(key: String, fallback: Boolean): Boolean =
    if (has(key) && opt(key) is Boolean) optBoolean(key) else fallback

private fun JSONObject.intOr(key: String, fallback: Int): Int =
    (opt(key) as? Number)?.toInt() ?: fallback

private fun JSONObject.floatOr(key: String, fallback: Float): Float =
    (opt(key) as? Number)?.toFloat() ?: fallback

internal fun parseLocalTransferCredentials(json: String): Map<String, String> {
        val root = JSONObject(json)
        require(root.optString("kind") == BACKUP_KIND) {
            "This is not a Waifu4 local-transfer backup."
        }
        val secrets = root.optJSONArray("providerSecrets")
            ?: error("The backup does not contain provider credentials.")
        val credentials = linkedMapOf<String, String>()

        for (index in 0 until secrets.length()) {
            val entry = secrets.optJSONObject(index) ?: continue
            val destination =
                SUPPORTED_CREDENTIALS[entry.optString("keyName")] ?: continue
            val secret = entry.optString("secret").trim()
            if (secret.isEmpty()) continue
            credentials[destination.keyName] = secret
        }

        require(credentials.isNotEmpty()) {
            "No Vercel, OpenRouter, or Fish credentials were found in the backup."
        }
        return credentials
}

private data class CredentialDestination(val keyName: String, val label: String)

private const val BACKUP_KIND = "local-transfer-backup"

private val SUPPORTED_CREDENTIALS =
    mapOf(
        "aiGateway.apiKey" to
            CredentialDestination(SecureKeyStore.VERCEL_KEY, "Vercel AI Gateway"),
        "fishSpeech.apiKey" to CredentialDestination(SecureKeyStore.FISH_KEY, "Fish Audio"),
        "openrouter.apiKey" to CredentialDestination(SecureKeyStore.OPENROUTER_KEY, "OpenRouter"),
        "openai.apiKey" to CredentialDestination(SecureKeyStore.OPENAI_BYOK_KEY, "OpenAI BYOK"),
        "tavily.apiKey" to CredentialDestination(SecureKeyStore.TAVILY_KEY, "Tavily"),
        "inworld.apiKey" to CredentialDestination(SecureKeyStore.INWORLD_KEY, "Inworld"),
    )
