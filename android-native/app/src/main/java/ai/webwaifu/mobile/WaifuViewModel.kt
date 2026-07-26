package ai.webwaifu.mobile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ai.webwaifu.mobile.data.SecureKeyStore
import ai.webwaifu.mobile.data.LocalTransferImporter
import ai.webwaifu.mobile.data.MobileMemoryStore
import ai.webwaifu.mobile.data.SettingsStore
import ai.webwaifu.mobile.data.VrmLibraryStore
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.BUNDLED_VRM_MODELS
import ai.webwaifu.mobile.model.ChatMessage
import ai.webwaifu.mobile.model.FishVoiceScope
import ai.webwaifu.mobile.model.MessageRole
import ai.webwaifu.mobile.model.WaifuUiState
import ai.webwaifu.mobile.network.AiGatewayClient
import ai.webwaifu.mobile.network.FishRealtimeClient
import ai.webwaifu.mobile.network.FishVoiceCatalogClient
import ai.webwaifu.mobile.network.LiveSpeechChunker
import ai.webwaifu.mobile.network.ModelCatalogClient
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class WaifuViewModel(application: Application) : AndroidViewModel(application) {
    private val settingsStore = SettingsStore(application)
    private val secureKeyStore = SecureKeyStore(application)
    private val localTransferImporter = LocalTransferImporter(application)
    private val mobileMemoryStore = MobileMemoryStore(application)
    private val vrmLibraryStore = VrmLibraryStore(application)
    private val aiClient = AiGatewayClient()
    private val fishClient = FishRealtimeClient(application)
    private val fishVoiceCatalogClient = FishVoiceCatalogClient()
    private val modelCatalogClient = ModelCatalogClient()
    private val idSequence = AtomicLong(System.currentTimeMillis())
    private var activeJob: Job? = null
    private val initialVrmModels = vrmLibraryStore.list()
    private val initialSettings = settingsStore.load()
    private val initialMemory = mobileMemoryStore.load(initialSettings.activePersonaId)

    private val _uiState =
        MutableStateFlow(
            WaifuUiState(
                messages =
                    initialMemory.conversation.ifEmpty {
                        listOf(
                            ChatMessage(
                                id = idSequence.incrementAndGet(),
                                role = MessageRole.SYSTEM,
                                text = "Native mobile runtime ready.",
                            ),
                        )
                    },
                settings = initialSettings,
                hasOpenRouterKey = secureKeyStore.has(SecureKeyStore.OPENROUTER_KEY),
                hasVercelKey = secureKeyStore.has(SecureKeyStore.VERCEL_KEY),
                hasFishKey = secureKeyStore.has(SecureKeyStore.FISH_KEY),
                savedVrmModels = initialVrmModels,
                activeVrmModelId = vrmLibraryStore.activeId(),
                activeBundledVrmId = vrmLibraryStore.activeBundledId(),
                avatarStatus =
                    vrmLibraryStore.activeId()
                        ?.let { activeId ->
                            initialVrmModels.firstOrNull { it.id == activeId }?.name
                        }
                        ?: BUNDLED_VRM_MODELS
                            .first { it.id == vrmLibraryStore.activeBundledId() }
                            .label,
                memoryProfile = initialMemory.profile,
                memoryHighlightCount = initialMemory.highlights.size,
            ),
        )
    val uiState: StateFlow<WaifuUiState> = _uiState.asStateFlow()

    init {
        refreshModels()
    }

    fun setDraft(value: String) {
        _uiState.update { it.copy(draft = value.take(4_000), error = null) }
    }

    fun setSettingsOpen(open: Boolean) {
        _uiState.update { it.copy(settingsOpen = open, error = null) }
        if (open && _uiState.value.hasFishKey && _uiState.value.fishVoices.isEmpty()) {
            refreshFishVoices(_uiState.value.settings.fishVoiceScope)
        }
    }

    fun dismissSettings() {
        _uiState.update {
            it.copy(
                settings = settingsStore.load(),
                settingsOpen = false,
                error = null,
            )
        }
    }

    fun previewAvatarSettings(preview: AppSettings) {
        _uiState.update { state ->
            state.copy(
                settings =
                    state.settings.copy(
                        animationPlaying = preview.animationPlaying,
                        animationShuffle = preview.animationShuffle,
                        animationLoop = preview.animationLoop,
                        animationSpeed = preview.animationSpeed,
                        animationDurationSeconds = preview.animationDurationSeconds,
                        selectedAnimationAsset = preview.selectedAnimationAsset,
                        postProcessingEnabled = preview.postProcessingEnabled,
                        colorCorrectionEnabled = preview.colorCorrectionEnabled,
                        sceneExposure = preview.sceneExposure,
                        colorPowerR = preview.colorPowerR,
                        colorPowerG = preview.colorPowerG,
                        colorPowerB = preview.colorPowerB,
                        bloomEnabled = preview.bloomEnabled,
                        bloomStrength = preview.bloomStrength,
                        vignetteEnabled = preview.vignetteEnabled,
                        vignetteStrength = preview.vignetteStrength,
                        ambientOcclusionEnabled = preview.ambientOcclusionEnabled,
                        ambientOcclusionIntensity = preview.ambientOcclusionIntensity,
                        dynamicResolutionEnabled = preview.dynamicResolutionEnabled,
                        cameraViewMode = preview.cameraViewMode,
                        avatarScale = preview.avatarScale,
                        avatarPositionX = preview.avatarPositionX,
                        avatarVerticalOffset = preview.avatarVerticalOffset,
                        avatarPositionZ = preview.avatarPositionZ,
                        avatarRotationX = preview.avatarRotationX,
                        avatarRotationY = preview.avatarRotationY,
                        avatarRotationZ = preview.avatarRotationZ,
                    ),
            )
        }
    }

    fun saveSettings(settings: AppSettings) {
        val providerChanged = settings.provider != _uiState.value.settings.provider
        val modelChanged = settings.activeModel != _uiState.value.settings.activeModel
        settingsStore.save(settings)
        _uiState.update {
            it.copy(
                settings = settings,
                settingsOpen = false,
                status = "Settings saved",
                error = null,
            )
        }
        if (providerChanged) {
            refreshModels()
        } else if (settings.provider == AiProvider.VERCEL && modelChanged) {
            refreshVercelEndpoints(settings.vercelModel)
        }
    }

    fun selectPersona(personaId: String) {
        val current = _uiState.value.settings
        if (current.activePersonaId == personaId) return
        mobileMemoryStore.saveConversation(current.activePersonaId, _uiState.value.messages)
        val next = current.copy(activePersonaId = personaId)
        val memory = mobileMemoryStore.load(personaId)
        settingsStore.save(next)
        _uiState.update {
            it.copy(
                settings = next,
                messages =
                    memory.conversation.ifEmpty {
                        listOf(
                            ChatMessage(
                                id = idSequence.incrementAndGet(),
                                role = MessageRole.SYSTEM,
                                text = "${next.activePersona.name} conversation ready.",
                            ),
                        )
                    },
                memoryProfile = memory.profile,
                memoryHighlightCount = memory.highlights.size,
                status = "${next.activePersona.name} active",
                error = null,
            )
        }
    }

    fun saveMemoryProfile(value: String) {
        val memory =
            mobileMemoryStore.saveProfile(
                _uiState.value.settings.activePersonaId,
                value,
            )
        _uiState.update {
            it.copy(
                memoryProfile = memory.profile,
                memoryHighlightCount = memory.highlights.size,
                status = "Memory profile saved",
                error = null,
            )
        }
    }

    fun clearMemory() {
        val memory =
            mobileMemoryStore.clearMemory(_uiState.value.settings.activePersonaId)
        _uiState.update {
            it.copy(
                memoryProfile = memory.profile,
                memoryHighlightCount = 0,
                status = "Durable memory cleared for ${it.settings.activePersona.name}",
                error = null,
            )
        }
    }

    fun refreshModels(provider: AiProvider = _uiState.value.settings.provider) {
        _uiState.update {
            it.copy(
                modelCatalogProvider = provider,
                modelsLoading = true,
                modelsError = null,
                availableModels = emptyList(),
            )
        }
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val key =
                        secureKeyStore.get(
                            when (provider) {
                                AiProvider.OPENROUTER -> SecureKeyStore.OPENROUTER_KEY
                                AiProvider.VERCEL -> SecureKeyStore.VERCEL_KEY
                            },
                        )
                    modelCatalogClient.fetch(provider, key)
                }
            }.onSuccess { models ->
                if (_uiState.value.modelCatalogProvider == provider) {
                    _uiState.update {
                        it.copy(
                            availableModels = models,
                            modelsLoading = false,
                            modelsError = null,
                        )
                    }
                    if (provider == AiProvider.VERCEL) {
                        refreshVercelEndpoints(_uiState.value.settings.vercelModel)
                    }
                }
            }.onFailure { error ->
                if (_uiState.value.modelCatalogProvider == provider) {
                    _uiState.update {
                        it.copy(
                            modelsLoading = false,
                            modelsError = error.message ?: "Model catalog unavailable.",
                        )
                    }
                }
            }
        }
    }

    fun refreshVercelEndpoints(model: String = _uiState.value.settings.vercelModel) {
        val normalized = model.trim()
        if (normalized.isBlank()) return
        _uiState.update {
            it.copy(
                endpointsModel = normalized,
                endpointsLoading = true,
                endpointsError = null,
                vercelProviderEndpoints = emptyList(),
            )
        }
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    modelCatalogClient.fetchVercelEndpoints(normalized)
                }
            }.onSuccess { endpoints ->
                if (_uiState.value.endpointsModel == normalized) {
                    _uiState.update {
                        it.copy(
                            vercelProviderEndpoints = endpoints,
                            endpointsLoading = false,
                            endpointsError = null,
                        )
                    }
                }
            }.onFailure { error ->
                if (_uiState.value.endpointsModel == normalized) {
                    _uiState.update {
                        it.copy(
                            endpointsLoading = false,
                            endpointsError =
                                error.message ?: "Vercel provider endpoints unavailable.",
                        )
                    }
                }
            }
        }
    }

    fun saveProviderKey(provider: AiProvider, value: String) {
        val keyName =
            when (provider) {
                AiProvider.OPENROUTER -> SecureKeyStore.OPENROUTER_KEY
                AiProvider.VERCEL -> SecureKeyStore.VERCEL_KEY
            }
        secureKeyStore.put(keyName, value)
        refreshKeyStatus()
    }

    fun clearProviderKey(provider: AiProvider) {
        saveProviderKey(provider, "")
    }

    fun saveFishKey(value: String) {
        secureKeyStore.put(SecureKeyStore.FISH_KEY, value)
        refreshKeyStatus()
        if (value.isNotBlank()) {
            refreshFishVoices(_uiState.value.settings.fishVoiceScope)
        }
    }

    fun clearFishKey() {
        saveFishKey("")
        _uiState.update {
            it.copy(
                fishVoices = emptyList(),
                fishVoicesScope = null,
                fishVoicesLoading = false,
                fishVoicesError = null,
            )
        }
    }

    fun importVrm(uri: Uri) {
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { vrmLibraryStore.import(uri) }
            }.onSuccess { model ->
                _uiState.update {
                    it.copy(
                        savedVrmModels = vrmLibraryStore.list(),
                        activeVrmModelId = model.id,
                        avatarRevision = it.avatarRevision + 1L,
                        avatarStatus = "Loaded ${model.name}",
                        error = null,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(error = error.message ?: "The selected VRM could not be imported.")
                }
            }
        }
    }

    fun selectVrm(sourceId: String?) {
        val savedId = sourceId?.removePrefix(SAVED_VRM_PREFIX)
            ?.takeIf { sourceId.startsWith(SAVED_VRM_PREFIX) }
        val bundledId =
            sourceId?.removePrefix(BUNDLED_VRM_PREFIX)
                ?.takeIf { sourceId.startsWith(BUNDLED_VRM_PREFIX) }
                ?: if (sourceId.isNullOrBlank()) "neuro-sama" else null
        runCatching {
            if (savedId != null) {
                vrmLibraryStore.setActive(savedId)
            } else {
                vrmLibraryStore.setActiveBundled(bundledId ?: error("Unknown VRM source."))
            }
        }
            .onSuccess {
                val selectedSaved =
                    _uiState.value.savedVrmModels.firstOrNull { it.id == savedId }
                val selectedBundled =
                    BUNDLED_VRM_MODELS.firstOrNull { it.id == bundledId }
                _uiState.update {
                    it.copy(
                        activeVrmModelId = savedId,
                        activeBundledVrmId = selectedBundled?.id ?: it.activeBundledVrmId,
                        avatarRevision = it.avatarRevision + 1L,
                        avatarStatus = selectedSaved?.name ?: selectedBundled?.label.orEmpty(),
                        emotion = ai.webwaifu.mobile.model.ReplyEmotion(),
                        emotionTriggeredAtMillis = SystemClock.elapsedRealtime(),
                        error = null,
                    )
                }
            }
            .onFailure { error ->
                _uiState.update { it.copy(error = error.message ?: "That VRM is unavailable.") }
            }
    }

    fun deleteVrm(modelId: String) {
        runCatching { vrmLibraryStore.delete(modelId) }
            .onSuccess {
                val deletedWasActive = _uiState.value.activeVrmModelId == modelId
                _uiState.update {
                    it.copy(
                        savedVrmModels = vrmLibraryStore.list(),
                        activeVrmModelId = if (deletedWasActive) null else it.activeVrmModelId,
                        avatarRevision = it.avatarRevision + 1L,
                        avatarStatus =
                            if (deletedWasActive) {
                                BUNDLED_VRM_MODELS
                                    .first { model -> model.id == it.activeBundledVrmId }
                                    .label
                            } else {
                                it.avatarStatus
                            },
                        error = null,
                    )
                }
            }
            .onFailure { error ->
                _uiState.update { it.copy(error = error.message ?: "The saved VRM was not deleted.") }
            }
    }

    fun resetExpression() {
        _uiState.update {
            it.copy(
                emotion = ai.webwaifu.mobile.model.ReplyEmotion(),
                emotionTriggeredAtMillis = SystemClock.elapsedRealtime(),
                mouthWeights = ai.webwaifu.mobile.model.MouthWeights(),
                speechAmplitude = 0f,
            )
        }
    }

    fun refreshFishVoices(scope: FishVoiceScope = _uiState.value.settings.fishVoiceScope) {
        val apiKey = secureKeyStore.get(SecureKeyStore.FISH_KEY)
        if (apiKey.isNullOrBlank()) {
            _uiState.update {
                it.copy(
                    fishVoicesLoading = false,
                    fishVoicesError = "Add a Fish Audio API key before fetching voices.",
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                fishVoices = emptyList(),
                fishVoicesScope = scope,
                fishVoicesLoading = true,
                fishVoicesError = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    fishVoiceCatalogClient.fetch(apiKey, scope)
                }
            }.onSuccess { voices ->
                if (_uiState.value.fishVoicesScope == scope) {
                    _uiState.update {
                        it.copy(
                            fishVoices = voices,
                            fishVoicesLoading = false,
                            fishVoicesError = null,
                        )
                    }
                }
            }.onFailure { error ->
                if (_uiState.value.fishVoicesScope == scope) {
                    _uiState.update {
                        it.copy(
                            fishVoicesLoading = false,
                            fishVoicesError = error.message ?: "Fish voice catalog unavailable.",
                        )
                    }
                }
            }
        }
    }

    fun importLocalTransferBackup(uri: Uri) {
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    localTransferImporter.import(uri)
                }
            }.onSuccess { result ->
                refreshKeyStatus()
                refreshModels()
                val importedMemory =
                    mobileMemoryStore.load(result.settings.activePersonaId)
                if (secureKeyStore.has(SecureKeyStore.FISH_KEY)) {
                    refreshFishVoices(result.settings.fishVoiceScope)
                }
                _uiState.update {
                    it.copy(
                        settings = result.settings,
                        messages =
                            importedMemory.conversation.ifEmpty {
                                it.messages
                            },
                        memoryProfile = importedMemory.profile,
                        memoryHighlightCount = importedMemory.highlights.size,
                        status = "Imported ${result.importedProviders.joinToString()}",
                        error = null,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(error = error.message ?: "The Waifu4 backup could not be imported.")
                }
            }
        }
    }

    fun send() {
        val snapshot = _uiState.value
        val text = snapshot.draft.trim()
        if (text.isEmpty() || snapshot.isGenerating) return

        val providerKey =
            secureKeyStore.get(
                when (snapshot.settings.provider) {
                    AiProvider.OPENROUTER -> SecureKeyStore.OPENROUTER_KEY
                    AiProvider.VERCEL -> SecureKeyStore.VERCEL_KEY
                },
            )
        if (providerKey.isNullOrBlank()) {
            _uiState.update {
                it.copy(
                    settingsOpen = true,
                    error = "Add a ${snapshot.settings.provider.displayName} key first.",
                )
            }
            return
        }
        if (snapshot.settings.activeModel.isBlank()) {
            _uiState.update { it.copy(settingsOpen = true, error = "Choose a model first.") }
            return
        }

        val userMessage =
            ChatMessage(
                id = idSequence.incrementAndGet(),
                role = MessageRole.USER,
                text = text,
            )
        val assistantId = idSequence.incrementAndGet()
        val assistantMessage =
            ChatMessage(
                id = assistantId,
                role = MessageRole.ASSISTANT,
                text = "",
                streaming = true,
            )
        val requestMessages =
            (snapshot.messages.filter { it.role != MessageRole.SYSTEM } + userMessage).takeLast(36)
        val turnStartedAt = SystemClock.elapsedRealtime()

        _uiState.update {
            it.copy(
                messages = (it.messages + userMessage + assistantMessage).takeLast(40),
                draft = "",
                isGenerating = true,
                status = "Connecting to ${snapshot.settings.provider.displayName}…",
                error = null,
            )
        }

        activeJob =
            viewModelScope.launch {
                val speechChunker =
                    LiveSpeechChunker(snapshot.settings.fishLiveChunkingStrategy)
                var fishSession: FishRealtimeClient.Session? = null
                var speechWarning: String? = null
                val pendingSpeech = ArrayDeque<String>()
                val speechLock = Any()
                var firstLlmDeltaLogged = false
                var firstSpeechChunkLogged = false
                var fishConnectJob: kotlinx.coroutines.Deferred<Result<FishRealtimeClient.Session>>? =
                    null

                fun deliverSpeechChunk(chunk: String) {
                    if (chunk.isBlank()) return
                    synchronized(speechLock) {
                        if (!firstSpeechChunkLogged) {
                            firstSpeechChunkLogged = true
                            Log.i(
                                LATENCY_LOG_TAG,
                                "first_speech_flush_ms=${SystemClock.elapsedRealtime() - turnStartedAt}",
                            )
                        }
                        val session = fishSession
                        if (session == null) {
                            pendingSpeech.addLast(chunk)
                            return
                        }
                        runCatching { session.sendText(chunk) }
                            .onFailure { error ->
                                speechWarning =
                                    "Fish voice ended early: ${error.message ?: "send failed"}"
                                session.cancel()
                                fishSession = null
                                pendingSpeech.clear()
                            }
                    }
                }

                try {
                    val fishKey = secureKeyStore.get(SecureKeyStore.FISH_KEY)
                    if (
                        snapshot.settings.voiceEnabled &&
                        snapshot.settings.voiceAutoSpeak &&
                        !fishKey.isNullOrBlank()
                    ) {
                        fishConnectJob =
                            async(Dispatchers.IO) {
                                runCatching {
                                    fishClient.connect(
                                        apiKey = fishKey,
                                        voiceId = snapshot.settings.fishVoiceId,
                                        model = snapshot.settings.fishWireModel,
                                        sampleRate = snapshot.settings.fishSampleRate,
                                        chunkLength = snapshot.settings.fishChunkLength,
                                        latency = snapshot.settings.fishLatency,
                                        conditionOnPreviousChunks =
                                            snapshot.settings.fishConditionOnPreviousChunks,
                                        onLipSync = { frame ->
                                            _uiState.update {
                                                it.copy(
                                                    speechAmplitude = frame.amplitude,
                                                    mouthWeights = frame.mouthWeights,
                                                    frequencyBands = frame.frequencyBands,
                                                    isSpeaking =
                                                        frame.amplitude > 0.01f || it.isSpeaking,
                                                )
                                            }
                                        },
                                        onFirstAudio = {
                                            Log.i(
                                                LATENCY_LOG_TAG,
                                                "first_pcm_ms=${SystemClock.elapsedRealtime() - turnStartedAt}",
                                            )
                                        },
                                    ).also { connected ->
                                        Log.i(
                                            LATENCY_LOG_TAG,
                                            "fish_open_ms=${SystemClock.elapsedRealtime() - turnStartedAt}",
                                        )
                                        synchronized(speechLock) {
                                            fishSession = connected
                                            while (pendingSpeech.isNotEmpty()) {
                                                connected.sendText(pendingSpeech.removeFirst())
                                            }
                                        }
                                        _uiState.update {
                                            if (it.isGenerating) {
                                                it.copy(status = "Streaming reply + realtime voice")
                                            } else {
                                                it
                                            }
                                        }
                                    }
                                }.onFailure { error ->
                                    speechWarning =
                                        "Fish voice unavailable: ${error.message ?: "connection failed"}"
                                    synchronized(speechLock) {
                                        fishSession?.cancel()
                                        fishSession = null
                                        pendingSpeech.clear()
                                    }
                                }
                            }
                    }

                    _uiState.update {
                        it.copy(
                            isSpeaking = false,
                            status =
                                if (fishConnectJob != null) {
                                    "Streaming reply + connecting voice"
                                } else {
                                    "Streaming reply"
                                },
                        )
                    }

                    val memorySnapshot =
                        mobileMemoryStore.load(snapshot.settings.activePersonaId)
                    val requestSettings =
                        if (snapshot.settings.memoryEnabled) {
                            snapshot.settings.copy(
                                memoryContext =
                                    mobileMemoryStore.buildPromptContext(
                                        memorySnapshot,
                                        snapshot.settings.memoryMaxHighlights,
                                    ),
                            )
                        } else {
                            snapshot.settings
                        }
                    val streamResult = withContext(Dispatchers.IO) {
                        aiClient.streamChat(
                            settings = requestSettings,
                            apiKey = providerKey,
                            byokOpenAiKey =
                                secureKeyStore.get(SecureKeyStore.OPENAI_BYOK_KEY),
                            modelInfo =
                                snapshot.availableModels.firstOrNull {
                                    it.id == snapshot.settings.activeModel
                                },
                            vercelEndpoints =
                                snapshot.vercelProviderEndpoints.takeIf {
                                    snapshot.endpointsModel == snapshot.settings.vercelModel
                                }.orEmpty(),
                            messages = requestMessages,
                        ) { visibleDelta ->
                            if (!firstLlmDeltaLogged && visibleDelta.isNotEmpty()) {
                                firstLlmDeltaLogged = true
                                Log.i(
                                    LATENCY_LOG_TAG,
                                    "first_llm_delta_ms=${SystemClock.elapsedRealtime() - turnStartedAt}",
                                )
                            }
                            appendAssistantDelta(assistantId, visibleDelta)
                            speechChunker.push(visibleDelta).forEach(::deliverSpeechChunk)
                        }
                    }

                    speechChunker.finish().forEach(::deliverSpeechChunk)
                    fishConnectJob?.await()
                    markAssistantFinished(assistantId)
                    val completedState = _uiState.value
                    val assistantText =
                        completedState.messages.firstOrNull { it.id == assistantId }?.text.orEmpty()
                    var updatedMemory =
                        mobileMemoryStore.saveConversation(
                            snapshot.settings.activePersonaId,
                            completedState.messages,
                        )
                    if (snapshot.settings.memoryEnabled && assistantText.isNotBlank()) {
                        updatedMemory =
                            mobileMemoryStore.recordTurn(
                                personaId = snapshot.settings.activePersonaId,
                                userText = text,
                                assistantText = assistantText,
                                maxHighlights = snapshot.settings.memoryMaxHighlights,
                            )
                    }
                    _uiState.update {
                        it.copy(
                            emotion = streamResult.emotion,
                            emotionTriggeredAtMillis = SystemClock.elapsedRealtime(),
                            isGenerating = false,
                            status = if (fishSession != null) "Finishing voice…" else "Ready",
                            error = speechWarning,
                            memoryProfile = updatedMemory.profile,
                            memoryHighlightCount = updatedMemory.highlights.size,
                        )
                    }

                    fishSession?.let { session ->
                        runCatching { withContext(Dispatchers.IO) { session.finish() } }
                            .onFailure { error ->
                                speechWarning =
                                    "Fish voice ended early: ${error.message ?: "unknown error"}"
                            }
                    }
                    _uiState.update {
                        it.copy(
                            isSpeaking = false,
                            speechAmplitude = 0f,
                            mouthWeights = ai.webwaifu.mobile.model.MouthWeights(),
                            frequencyBands = ai.webwaifu.mobile.model.FrequencyBands(),
                            status = "Ready",
                            error = speechWarning,
                        )
                    }
                } catch (cancelled: CancellationException) {
                    fishConnectJob?.cancel()
                    fishClient.stop()
                    markAssistantFinished(assistantId)
                    throw cancelled
                } catch (error: Throwable) {
                    fishConnectJob?.cancel()
                    fishClient.stop()
                    val message = error.message ?: "The request failed."
                    removeEmptyAssistant(assistantId)
                    _uiState.update {
                        it.copy(
                            isGenerating = false,
                            isSpeaking = false,
                            speechAmplitude = 0f,
                            mouthWeights = ai.webwaifu.mobile.model.MouthWeights(),
                            frequencyBands = ai.webwaifu.mobile.model.FrequencyBands(),
                            status = "Request failed",
                            error = message,
                        )
                    }
                } finally {
                    activeJob = null
                }
            }
    }

    fun stop() {
        aiClient.cancel()
        fishClient.stop()
        activeJob?.cancel()
        activeJob = null
        _uiState.update {
            it.copy(
                isGenerating = false,
                isSpeaking = false,
                speechAmplitude = 0f,
                mouthWeights = ai.webwaifu.mobile.model.MouthWeights(),
                frequencyBands = ai.webwaifu.mobile.model.FrequencyBands(),
                status = "Stopped",
            )
        }
    }

    fun clearChat() {
        stop()
        mobileMemoryStore.clearConversation(_uiState.value.settings.activePersonaId)
        _uiState.update {
            it.copy(
                messages =
                    listOf(
                        ChatMessage(
                            id = idSequence.incrementAndGet(),
                            role = MessageRole.SYSTEM,
                            text = "Conversation cleared.",
                        ),
                    ),
                error = null,
                status = "Ready",
            )
        }
    }

    private fun appendAssistantDelta(id: Long, delta: String) {
        _uiState.update { state ->
            state.copy(
                messages =
                    state.messages.map { message ->
                        if (message.id == id) message.copy(text = message.text + delta) else message
                    },
            )
        }
    }

    private fun markAssistantFinished(id: Long) {
        _uiState.update { state ->
            state.copy(
                messages =
                    state.messages.map { message ->
                        if (message.id == id) message.copy(streaming = false) else message
                    },
            )
        }
    }

    private fun removeEmptyAssistant(id: Long) {
        _uiState.update { state ->
            state.copy(
                messages =
                    state.messages.filterNot { message ->
                        message.id == id && message.text.isBlank()
                    },
            )
        }
    }

    private fun refreshKeyStatus() {
        _uiState.update {
            it.copy(
                hasOpenRouterKey = secureKeyStore.has(SecureKeyStore.OPENROUTER_KEY),
                hasVercelKey = secureKeyStore.has(SecureKeyStore.VERCEL_KEY),
                hasFishKey = secureKeyStore.has(SecureKeyStore.FISH_KEY),
            )
        }
    }

    override fun onCleared() {
        aiClient.cancel()
        fishClient.stop()
        mobileMemoryStore.saveConversation(
            _uiState.value.settings.activePersonaId,
            _uiState.value.messages,
        )
        super.onCleared()
    }

    private companion object {
        const val LATENCY_LOG_TAG = "WebWaifuLatency"
        const val BUNDLED_VRM_PREFIX = "bundled:"
        const val SAVED_VRM_PREFIX = "saved:"
    }
}
