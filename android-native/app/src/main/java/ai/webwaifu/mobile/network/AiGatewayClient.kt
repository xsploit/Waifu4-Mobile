package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.ChatMessage
import ai.webwaifu.mobile.model.MessageRole
import ai.webwaifu.mobile.model.OpenRouterRouting
import ai.webwaifu.mobile.model.ProviderEndpoint
import ai.webwaifu.mobile.model.ProviderModel
import ai.webwaifu.mobile.model.ReplyEmotion
import ai.webwaifu.mobile.model.ReplyLength
import ai.webwaifu.mobile.model.VercelRouting
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native Kotlin translation of Waifu4's `server/ai/llmGateway.ts`.
 *
 * The original uses Vercel AI SDK provider adapters. Android talks to the providers' compatible
 * HTTP endpoints directly, so this class emits the final wire fields those adapters represent:
 * routing, caching, reasoning, JSON-schema output, strict-tool compatibility, usage and SSE.
 */
class AiGatewayClient {
    @Volatile
    private var activeConnection: HttpURLConnection? = null

    fun streamChat(
        settings: AppSettings,
        apiKey: String,
        byokOpenAiKey: String?,
        modelInfo: ProviderModel?,
        vercelEndpoints: List<ProviderEndpoint>,
        messages: List<ChatMessage>,
        onDelta: (String) -> Unit,
    ): StreamResult {
        val replyFormat = selectReplyFormat(settings, modelInfo, vercelEndpoints)
        val initialTransport =
            if (
                replyFormat == ReplyFormat.STRUCTURED &&
                settings.provider == AiProvider.VERCEL &&
                settings.activeModel == DEEPSEEK_V4_PRO
            ) {
                StructuredTransport.STRICT_TOOL
            } else {
                StructuredTransport.NATIVE
            }
        var emitted = false
        val emit: (String) -> Unit = {
            if (it.isNotEmpty()) emitted = true
            onDelta(it)
        }
        return try {
            execute(
                settings = settings,
                apiKey = apiKey,
                byokOpenAiKey = byokOpenAiKey,
                modelInfo = modelInfo,
                messages = messages,
                replyFormat = replyFormat,
                transport = initialTransport,
                onDelta = emit,
            )
        } catch (error: Throwable) {
            if (
                replyFormat != ReplyFormat.STRUCTURED ||
                initialTransport == StructuredTransport.STRICT_TOOL ||
                emitted ||
                !isStructuredCompatibilityError(error)
            ) {
                throw error
            }
            execute(
                settings = settings,
                apiKey = apiKey,
                byokOpenAiKey = byokOpenAiKey,
                modelInfo = modelInfo,
                messages = messages,
                replyFormat = replyFormat,
                transport = StructuredTransport.STRICT_TOOL,
                onDelta = emit,
            )
        }
    }

    fun cancel() {
        activeConnection?.disconnect()
        activeConnection = null
    }

    internal fun selectReplyFormat(
        settings: AppSettings,
        modelInfo: ProviderModel?,
        vercelEndpoints: List<ProviderEndpoint>,
    ): ReplyFormat {
        if (settings.provider == AiProvider.OPENROUTER) {
            return if (modelInfo?.supportsStructuredOutputs == true) {
                ReplyFormat.STRUCTURED
            } else {
                ReplyFormat.TEXT
            }
        }
        val active = vercelEndpoints.filter { it.status == null || it.status == 0 }
        if (active.isEmpty()) return ReplyFormat.TEXT
        val pinned = parseProviderSlugs(settings.vercelProviderSlugs)
        val pinnedEndpoints =
            pinned.mapNotNull { slug -> active.firstOrNull { it.providerName == slug } }
        if (pinned.isNotEmpty() && pinnedEndpoints.size != pinned.size) return ReplyFormat.TEXT
        val eligible =
            if (
                settings.vercelRouting == VercelRouting.PINNED &&
                !settings.vercelAllowFallbacks &&
                pinned.isNotEmpty()
            ) {
                pinnedEndpoints
            } else {
                active
            }
        return if (eligible.isNotEmpty() && eligible.all { it.supportsStructuredOutputs }) {
            ReplyFormat.STRUCTURED
        } else {
            ReplyFormat.TEXT
        }
    }

    internal fun buildRequest(
        settings: AppSettings,
        byokOpenAiKey: String?,
        modelInfo: ProviderModel?,
        messages: List<ChatMessage>,
        replyFormat: ReplyFormat,
        transport: StructuredTransport,
    ): JSONObject =
        if (settings.provider == AiProvider.VERCEL) {
            buildVercelAiSdkRequest(
                settings = settings,
                byokOpenAiKey = byokOpenAiKey,
                messages = messages,
                replyFormat = replyFormat,
                transport = transport,
            )
        } else {
            buildOpenRouterRequest(
                settings = settings,
                modelInfo = modelInfo,
                messages = messages,
                replyFormat = replyFormat,
                transport = transport,
            )
        }

    /**
     * Exact protocol headers emitted by Waifu4's pinned `@ai-sdk/gateway@4.0.16`.
     *
     * The gateway-level version is separate from the LanguageModel specification version. Omitting
     * it makes Vercel reject an otherwise-valid v4 language-model request before model routing.
     */
    internal fun vercelProtocolHeaders(
        modelId: String,
        streaming: Boolean = true,
    ): Map<String, String> =
        mapOf(
            "ai-gateway-protocol-version" to VERCEL_GATEWAY_PROTOCOL_VERSION,
            "ai-gateway-auth-method" to "api-key",
            "ai-language-model-specification-version" to "4",
            "ai-language-model-id" to modelId.trim(),
            "ai-language-model-streaming" to streaming.toString(),
        )

    private fun buildOpenRouterRequest(
        settings: AppSettings,
        modelInfo: ProviderModel?,
        messages: List<ChatMessage>,
        replyFormat: ReplyFormat,
        transport: StructuredTransport,
    ): JSONObject {
        val structured = replyFormat == ReplyFormat.STRUCTURED
        val strictTool = structured && transport == StructuredTransport.STRICT_TOOL
        val body =
            JSONObject()
                .put("model", settings.activeModel.trim())
                .put("messages", buildMessages(settings, messages))
                .put("stream", true)
                .put("max_tokens", settings.maxTokens)
                .put("stream_options", JSONObject().put("include_usage", true))
        if (!isReasoningModel(settings.activeModel)) {
            body.put("temperature", settings.temperature.toDouble())
        }
        if (structured && !strictTool) {
            body.put(
                "response_format",
                JSONObject()
                    .put("type", "json_schema")
                    .put(
                        "json_schema",
                        JSONObject()
                            .put("name", "assistant_reply")
                            .put("strict", true)
                            .put("schema", assistantReplySchema()),
                    ),
            )
        }
        if (strictTool) {
            body
                .put(
                    "tools",
                    JSONArray().put(
                        JSONObject()
                            .put("type", "function")
                            .put(
                                "function",
                                JSONObject()
                                    .put("name", "assistant_reply")
                                    .put("description", "Return the complete WebWaifu assistant reply.")
                                    .put("strict", true)
                                    .put("parameters", assistantReplySchema()),
                            ),
                    ),
                )
                .put("tool_choice", "required")
        }

        applyOpenRouterOptions(body, settings, modelInfo, structured || strictTool)
        return body
    }

    /**
     * Wire-compatible translation of Waifu4's pinned `@ai-sdk/gateway` v4 adapter.
     *
     * Vercel receives provider-independent LanguageModelV4CallOptions here. Model selection and
     * streaming are sent through the `ai-language-model-*` headers in [execute].
     */
    internal fun buildVercelAiSdkRequest(
        settings: AppSettings,
        byokOpenAiKey: String?,
        messages: List<ChatMessage>,
        replyFormat: ReplyFormat,
        transport: StructuredTransport,
    ): JSONObject {
        val structured = replyFormat == ReplyFormat.STRUCTURED
        val strictTool = structured && transport == StructuredTransport.STRICT_TOOL
        val body =
            JSONObject()
                .put("prompt", buildVercelPrompt(settings, messages))
                .put("maxOutputTokens", settings.maxTokens)
        if (!isReasoningModel(settings.activeModel)) {
            body.put("temperature", settings.temperature.toDouble())
        }
        if (structured && !strictTool) {
            body.put(
                "responseFormat",
                JSONObject()
                    .put("type", "json")
                    .put("schema", assistantReplySchema())
                    .put("name", "assistant_reply")
                    .put(
                        "description",
                        "A WebWaifu assistant reply. The message field is spoken to the user; emotion and VAD drive avatar reactions.",
                    ),
            )
        }
        if (strictTool) {
            body
                .put(
                    "tools",
                    JSONArray().put(
                        JSONObject()
                            .put("type", "function")
                            .put("name", "assistant_reply")
                            .put("description", "Return the complete WebWaifu assistant reply.")
                            .put("inputSchema", assistantReplySchema())
                            .put("strict", true),
                    ),
                )
                .put("toolChoice", JSONObject().put("type", "required"))
        }
        applyVercelOptions(body, settings, byokOpenAiKey, structured)
        return body
    }

    private fun execute(
        settings: AppSettings,
        apiKey: String,
        byokOpenAiKey: String?,
        modelInfo: ProviderModel?,
        messages: List<ChatMessage>,
        replyFormat: ReplyFormat,
        transport: StructuredTransport,
        onDelta: (String) -> Unit,
    ): StreamResult {
        val endpoint =
            if (settings.provider == AiProvider.VERCEL) {
                VERCEL_AI_SDK_LANGUAGE_MODEL_URL
            } else {
                OPENROUTER_CHAT_URL
            }
        val connection =
            (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 30_000
                readTimeout = 120_000
                doOutput = true
                setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "text/event-stream")
                if (settings.provider == AiProvider.VERCEL) {
                    setRequestProperty("User-Agent", VERCEL_GATEWAY_USER_AGENT)
                    vercelProtocolHeaders(settings.activeModel).forEach(::setRequestProperty)
                } else {
                    setRequestProperty("User-Agent", "WebWaifu-Mobile/0.1")
                    setRequestProperty("HTTP-Referer", "https://github.com/xsploit/Waifu4")
                    setRequestProperty("X-Title", "WebWaifu Mobile")
                    if (transport == StructuredTransport.STRICT_TOOL) {
                        setRequestProperty(
                            "X-Anthropic-Beta",
                            "structured-outputs-2025-11-13",
                        )
                    }
                }
            }
        activeConnection = connection

        try {
            val request =
                buildRequest(
                    settings,
                    byokOpenAiKey,
                    modelInfo,
                    messages,
                    replyFormat,
                    transport,
                ).toString().toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(request.size)
            connection.outputStream.use { it.write(request) }

            val status = connection.responseCode
            if (status !in 200..299) {
                val detail =
                    connection.errorStream
                        ?.bufferedReader()
                        ?.use { it.readText() }
                        ?.take(2_000)
                        .orEmpty()
                throw ProviderException(readErrorMessage(detail, status))
            }
            return if (settings.provider == AiProvider.VERCEL) {
                BufferedReader(InputStreamReader(connection.inputStream, Charsets.UTF_8)).use {
                    consumeVercelAiSdkStream(
                        reader = it,
                        replyFormat = replyFormat,
                        transport = transport,
                        onDelta = onDelta,
                    )
                }
            } else {
                consumeOpenRouterStream(
                    connection = connection,
                    replyFormat = replyFormat,
                    transport = transport,
                    onDelta = onDelta,
                )
            }
        } finally {
            activeConnection = null
            connection.disconnect()
        }
    }

    private fun consumeOpenRouterStream(
        connection: HttpURLConnection,
        replyFormat: ReplyFormat,
        transport: StructuredTransport,
        onDelta: (String) -> Unit,
    ): StreamResult {
        val textFilter = ReplyStreamFilter()
        val structuredParser = StructuredReplyParser()
        val toolParser = StructuredReplyParser()
        val fallbackText = StringBuilder()
        var emittedCharacters = 0

        fun emit(value: String) {
            if (value.isNotEmpty()) {
                emittedCharacters += value.length
                onDelta(value)
            }
        }

        BufferedReader(InputStreamReader(connection.inputStream, Charsets.UTF_8)).use { reader ->
            readSse(reader) { payload ->
                if (payload == "[DONE]") return@readSse false
                val json = runCatching { JSONObject(payload) }.getOrNull() ?: return@readSse true
                json.optJSONObject("error")?.let { error ->
                    throw ProviderException(
                        error.optString("message", "The provider ended the stream."),
                    )
                }
                val first = json.optJSONArray("choices")?.optJSONObject(0) ?: return@readSse true
                val delta = first.optJSONObject("delta")
                val content = delta?.optString("content").orEmpty()
                when {
                    replyFormat == ReplyFormat.TEXT -> emit(textFilter.accept(content))
                    transport == StructuredTransport.NATIVE -> emit(structuredParser.push(content))
                    else -> {
                        fallbackText.append(content)
                        val calls = delta?.optJSONArray("tool_calls")
                        for (index in 0 until (calls?.length() ?: 0)) {
                            val arguments =
                                calls?.optJSONObject(index)
                                    ?.optJSONObject("function")
                                    ?.optString("arguments")
                                    .orEmpty()
                            emit(toolParser.push(arguments))
                        }
                    }
                }
                true
            }
        }

        if (replyFormat == ReplyFormat.TEXT) {
            val final = textFilter.finish()
            emit(final.visibleTail)
            if (emittedCharacters == 0) {
                throw ProviderException(
                    "Model returned no visible text (try lower reasoning effort or another model).",
                )
            }
            return StreamResult(final.emotion, ReplyFormat.TEXT)
        }

        val parsed =
            if (transport == StructuredTransport.NATIVE) {
                runCatching { structuredParser.finish() }
                    .getOrElse { structuredParser.recoverPartial() ?: throw it }
            } else {
                recoverStrictToolReply(toolParser, fallbackText.toString())
            }
        val tail =
            if (parsed.message.startsWithLength(emittedCharacters)) {
                parsed.message.substring(emittedCharacters)
            } else {
                ""
            }
        emit(tail)
        if (emittedCharacters == 0) {
            throw ProviderException("Model returned an empty structured reply.")
        }
        return StreamResult(parsed.emotion, ReplyFormat.STRUCTURED)
    }

    /**
     * Consumes the normalized LanguageModelV4 SSE parts returned by Vercel's gateway adapter.
     * Reasoning parts stay hidden, matching Waifu4's `streamChat` visible-text contract.
     */
    internal fun consumeVercelAiSdkStream(
        reader: BufferedReader,
        replyFormat: ReplyFormat,
        transport: StructuredTransport,
        onDelta: (String) -> Unit,
    ): StreamResult {
        val textFilter = ReplyStreamFilter()
        val structuredParser = StructuredReplyParser()
        val toolParser = StructuredReplyParser()
        val fallbackText = StringBuilder()
        var activeReplyId = ""
        var sawToolInputDelta = false
        var emittedCharacters = 0
        val eventCounts = linkedMapOf<String, Int>()
        var rawTextCharacters = 0
        var reasoningCharacters = 0
        var toolInputCharacters = 0
        var finishReason = ""

        fun emit(value: String) {
            if (value.isNotEmpty()) {
                emittedCharacters += value.length
                onDelta(value)
            }
        }

        readSse(reader) { payload ->
            if (payload == "[DONE]") return@readSse false
            val part = runCatching { JSONObject(payload) }.getOrNull() ?: return@readSse true
            val type = part.optString("type").ifBlank { "missing-type" }
            eventCounts[type] = eventCounts.getOrDefault(type, 0) + 1
            when (type) {
                "error" -> throw ProviderException(readAiSdkStreamError(part.opt("error")))
                "reasoning-delta" -> {
                    reasoningCharacters += part.optString("delta").length
                }
                "text-delta" -> {
                    val delta = part.optString("delta").orEmpty()
                    rawTextCharacters += delta.length
                    when {
                        replyFormat == ReplyFormat.TEXT -> emit(textFilter.accept(delta))
                        transport == StructuredTransport.NATIVE ->
                            emit(structuredParser.push(delta))
                        else -> fallbackText.append(delta)
                    }
                }
                "tool-input-start" -> {
                    if (part.optString("toolName") == "assistant_reply") {
                        activeReplyId = part.optString("id")
                        sawToolInputDelta = false
                    }
                }
                "tool-input-delta" -> {
                    if (
                        transport == StructuredTransport.STRICT_TOOL &&
                        activeReplyId.isNotEmpty() &&
                        part.optString("id") == activeReplyId
                    ) {
                        sawToolInputDelta = true
                        val delta = part.optString("delta").orEmpty()
                        toolInputCharacters += delta.length
                        emit(toolParser.push(delta))
                    }
                }
                "tool-call" -> {
                    if (
                        transport == StructuredTransport.STRICT_TOOL &&
                        part.optString("toolName") == "assistant_reply" &&
                        !sawToolInputDelta
                    ) {
                        val input = part.optString("input").orEmpty()
                        toolInputCharacters += input.length
                        emit(toolParser.push(input))
                    }
                }
                "finish" -> {
                    finishReason = describeFinishReason(part.opt("finishReason"))
                }
            }
            true
        }

        if (replyFormat == ReplyFormat.TEXT) {
            val final = textFilter.finish()
            emit(final.visibleTail)
            if (emittedCharacters == 0) {
                throw ProviderException(
                    "Model returned no visible text (${describeVercelStream(
                        eventCounts = eventCounts,
                        rawTextCharacters = rawTextCharacters,
                        reasoningCharacters = reasoningCharacters,
                        toolInputCharacters = toolInputCharacters,
                        finishReason = finishReason,
                    )}).",
                )
            }
            return StreamResult(final.emotion, ReplyFormat.TEXT)
        }

        val parsed =
            if (transport == StructuredTransport.NATIVE) {
                runCatching { structuredParser.finish() }
                    .getOrElse { structuredParser.recoverPartial() ?: throw it }
            } else {
                recoverStrictToolReply(toolParser, fallbackText.toString())
            }
        val tail =
            if (parsed.message.startsWithLength(emittedCharacters)) {
                parsed.message.substring(emittedCharacters)
            } else {
                ""
            }
        emit(tail)
        if (emittedCharacters == 0) {
            throw ProviderException("Model returned an empty structured reply.")
        }
        return StreamResult(parsed.emotion, ReplyFormat.STRUCTURED)
    }

    private fun describeVercelStream(
        eventCounts: Map<String, Int>,
        rawTextCharacters: Int,
        reasoningCharacters: Int,
        toolInputCharacters: Int,
        finishReason: String,
    ): String {
        val counts =
            eventCounts.entries.joinToString(",") { (type, count) -> "$type=$count" }
                .ifBlank { "no-events" }
        return buildString {
            append("gateway stream: ")
            append(counts)
            append("; text-chars=")
            append(rawTextCharacters)
            append("; reasoning-chars=")
            append(reasoningCharacters)
            append("; tool-chars=")
            append(toolInputCharacters)
            if (finishReason.isNotBlank()) {
                append("; finish=")
                append(finishReason)
            }
        }
    }

    private fun describeFinishReason(value: Any?): String =
        when (value) {
            is JSONObject ->
                value.optString("unified")
                    .ifBlank { value.optString("raw") }
                    .ifBlank { value.toString().take(120) }
            is String -> value.take(120)
            else -> ""
        }

    private fun recoverStrictToolReply(
        parser: StructuredReplyParser,
        fallbackText: String,
    ): StructuredReplyParser.StructuredReply {
        runCatching { parser.finish() }.getOrNull()?.let { return it }
        parser.recoverPartial()?.let { return it }
        val trimmed =
            fallbackText.trim()
                .removePrefix("```json")
                .removePrefix("```")
                .removeSuffix("```")
                .trim()
        runCatching {
            val root = JSONObject(trimmed)
            val message = root.optString("message").trimEnd()
            require(message.isNotBlank())
            StructuredReplyParser.StructuredReply(message, parseReplyEmotion(root))
        }.getOrNull()?.let { return it }

        val laneB = ReplyStreamFilter()
        val visible = laneB.accept(trimmed) + laneB.finish().visibleTail
        if (visible.isNotBlank()) {
            return StructuredReplyParser.StructuredReply(visible.trimEnd(), ReplyEmotion())
        }
        throw ProviderException("Invalid assistant_reply tool call.")
    }

    private fun applyOpenRouterOptions(
        body: JSONObject,
        settings: AppSettings,
        modelInfo: ProviderModel?,
        requireParameters: Boolean,
    ) {
        val provider = JSONObject()
        if (requireParameters) provider.put("require_parameters", true)
        when (settings.openRouterRouting) {
            OpenRouterRouting.AUTO -> Unit
            OpenRouterRouting.LATENCY -> provider.put("sort", "latency")
            OpenRouterRouting.THROUGHPUT -> provider.put("sort", "throughput")
            OpenRouterRouting.PINNED -> {
                val providers = parseProviderSlugs(settings.openRouterProviderSlugs)
                if (providers.isNotEmpty()) {
                    provider.put("only", JSONArray(providers))
                    provider.put("allow_fallbacks", settings.openRouterAllowFallbacks)
                }
            }
        }
        if (provider.length() > 0) body.put("provider", provider)
        body.put("usage", JSONObject().put("include", true))

        selectOpenRouterReasoningEffort(modelInfo)?.let { effort ->
            body.put(
                "reasoning",
                JSONObject()
                    .put("effort", effort)
                    .also { if (effort != "none") it.put("exclude", true) },
            )
        }
    }

    private fun applyVercelOptions(
        body: JSONObject,
        settings: AppSettings,
        byokOpenAiKey: String?,
        structured: Boolean,
    ) {
        val gateway =
            when {
                structured && settings.activeModel == DEEPSEEK_V4_FLASH ->
                    JSONObject().put("order", JSONArray(listOf("azure", "fireworks")))
                structured && settings.activeModel == DEEPSEEK_V4_PRO ->
                    JSONObject().put(
                        "order",
                        JSONArray(listOf("baseten", "deepseek", "fireworks")),
                    )
                else -> JSONObject().put("sort", "ttft")
            }
        when (settings.vercelRouting) {
            VercelRouting.AUTO -> Unit
            VercelRouting.LATENCY -> gateway.clearAndPut("sort", "ttft")
            VercelRouting.THROUGHPUT -> gateway.clearAndPut("sort", "tps")
            VercelRouting.COST -> gateway.clearAndPut("sort", "cost")
            VercelRouting.PINNED -> {
                val providers = parseProviderSlugs(settings.vercelProviderSlugs)
                if (providers.isNotEmpty()) {
                    gateway.clearAndPut(
                        if (settings.vercelAllowFallbacks) "order" else "only",
                        JSONArray(providers),
                    )
                }
            }
        }
        byokOpenAiKey?.trim()?.takeIf(String::isNotEmpty)?.let { key ->
            gateway.put(
                "byok",
                JSONObject().put(
                    "openai",
                    JSONArray().put(JSONObject().put("apiKey", key)),
                ),
            )
        }
        gateway.put("caching", "auto")
        val providerOptions = JSONObject().put("gateway", gateway)
        if (isReasoningModel(settings.activeModel)) {
            providerOptions.put(
                "openai",
                JSONObject().put("reasoningEffort", settings.reasoningEffort.wireValue),
            )
        }
        if (settings.activeModel.startsWith("deepseek/")) {
            providerOptions.put(
                "deepseek",
                JSONObject().put("thinking", JSONObject().put("type", "disabled")),
            )
        }
        body.put("providerOptions", providerOptions)
    }

    private fun buildMessages(
        settings: AppSettings,
        messages: List<ChatMessage>,
    ): JSONArray =
        JSONArray().apply {
            put(JSONObject().put("role", "system").put("content", buildSystemPrompt(settings)))
            messages
                .filter { it.role != MessageRole.SYSTEM && it.text.isNotBlank() }
                .takeLast(12)
                .forEach { message ->
                    put(
                        JSONObject()
                            .put(
                                "role",
                                if (message.role == MessageRole.ASSISTANT) "assistant" else "user",
                            )
                            .put("content", message.text),
                    )
                }
        }

    private fun buildVercelPrompt(
        settings: AppSettings,
        messages: List<ChatMessage>,
    ): JSONArray =
        JSONArray().apply {
            put(
                JSONObject()
                    .put("role", "system")
                    .put("content", buildSystemPrompt(settings)),
            )
            messages
                .filter { it.role != MessageRole.SYSTEM && it.text.isNotBlank() }
                .takeLast(12)
                .forEach { message ->
                    put(
                        JSONObject()
                            .put(
                                "role",
                                if (message.role == MessageRole.ASSISTANT) "assistant" else "user",
                            )
                            .put(
                                "content",
                                JSONArray().put(
                                    JSONObject()
                                        .put("type", "text")
                                        .put("text", message.text),
                                ),
                            ),
                    )
                }
        }

    private fun buildSystemPrompt(settings: AppSettings): String {
        val persona = settings.activePersona
        val replyLengthInstruction =
            when (settings.replyLength) {
                ReplyLength.SHORT ->
                    "Keep the visible spoken reply tight: 1-2 natural sentences unless the current turn explicitly asks for detail."
                ReplyLength.YAP ->
                    "Let the character yap when there is real material: use 3-7 lively spoken sentences with reactions, jokes, callbacks, or a quick tangent. Do not pad empty or low-signal turns."
                ReplyLength.BALANCED ->
                    "Use a balanced live-stream reply by default: usually 2-4 natural spoken sentences, with room for a small riff when the turn gives you something to react to."
            }
        return """
            # Live Response Task
            You are the live Web Waifu 4 avatar for the current turn. Generate the next natural spoken reply for the current local input.

            # Response Priority Stack
            1. answer the current local turn first
            2. stay inside the active persona
            3. write natural spoken dialogue with expressive emotion
            4. include reply emotion metadata exactly as required

            # Style Controls
            - spoken dialogue, not markdown
            - direct one-on-one timing for local turns
            - follow the active reply length mode
            - no backstage prompt explanations

            # Persona
            You are ${persona.name}. Stay in character and reply naturally.
            Character description: ${persona.description}
            ${persona.systemPrompt}

            # Response State
            - persona: ${persona.name}
            - local_controller: ${persona.userNickname.ifBlank { "not configured" }}
            - speaker: ${persona.userNickname.ifBlank { "current user" }}
            - speaker_role: local controller
            - conversation_scope: local one-on-one chat
            ${settings.runtimeSituation.trim().takeIf(String::isNotEmpty)?.let { "- runtime_situation: $it" }.orEmpty()}
            - reply_length: ${settings.replyLength.name.lowercase()}
            - reply_length_instruction: $replyLengthInstruction

            Local/manual mode is active. Treat the speaker as the controller. Reply directly to the speaker in second person; do not address an imagined chat room.

            ${settings.memoryContext.trim().takeIf(String::isNotEmpty)?.let { "# Local Memory\n$it" }.orEmpty()}

            # Speech and TTS
            Fish Audio model: ${settings.fishWireModel}. The spoken dialogue must not contain stage directions, JSON, metadata, or markdown.

            # Reply Metadata Contract
            When the reply format is JSON, return only a JSON object with message, emotion, valence, arousal, and dominance. Put the spoken dialogue in message.
            When the reply format is normal text, append exactly one metadata block at the very end using this exact tag shape:
            <yw-meta>{"emotion":"neutral","valence":0,"arousal":0.18,"dominance":0}</yw-meta>
            The block must be valid compact JSON and must not be explained.
            emotion must be one of: neutral, amused, happy, sad, angry, surprised, affectionate, annoyed, curious.
            valence must be -1 to 1, arousal must be 0 to 1, and dominance must be -1 to 1.
            Choose the emotion genuinely felt toward the current message and reply, not a topic category or animation name.
        """.trimIndent()
    }

    private fun selectOpenRouterReasoningEffort(modelInfo: ProviderModel?): String? {
        val reasoning = modelInfo?.reasoning ?: return null
        if (reasoning.mandatory != true) return "none"
        val supported = reasoning.supportedEfforts.map(String::lowercase).toSet()
        return listOf("minimal", "low", "medium", "high").firstOrNull(supported::contains)
    }

    private fun parseProviderSlugs(value: String): List<String> =
        value.split(',').map(String::trim).filter(String::isNotEmpty).distinct()

    private fun isReasoningModel(model: String): Boolean {
        val leaf = model.lowercase()
        if (leaf.contains("gpt-5")) return true
        val modelName = leaf.substringAfterLast('/')
        return listOf("o1", "o3", "o4").any { prefix ->
            modelName == prefix ||
                modelName.startsWith("$prefix-") ||
                modelName.startsWith("$prefix.")
        }
    }

    private fun isStructuredCompatibilityError(error: Throwable): Boolean {
        val message = error.message.orEmpty().lowercase()
        return STRUCTURED_COMPATIBILITY_PHRASES.any(message::contains)
    }

    private fun assistantReplySchema(): JSONObject =
        JSONObject()
            .put("type", "object")
            .put(
                "properties",
                JSONObject()
                    .put(
                        "message",
                        JSONObject()
                            .put("type", "string")
                            .put("description", "The spoken dialogue to say out loud. No stage directions, no JSON, no metadata."),
                    )
                    .put(
                        "emotion",
                        JSONObject()
                            .put("type", "string")
                            .put("enum", JSONArray(REPLY_EMOTIONS)),
                    )
                    .put("valence", numberSchema(-1.0, 1.0))
                    .put("arousal", numberSchema(0.0, 1.0))
                    .put("dominance", numberSchema(-1.0, 1.0)),
            )
            .put(
                "required",
                JSONArray(listOf("message", "emotion", "valence", "arousal", "dominance")),
            )
            .put("additionalProperties", false)

    private fun numberSchema(minimum: Double, maximum: Double): JSONObject =
        JSONObject().put("type", "number").put("minimum", minimum).put("maximum", maximum)

    private fun readSse(reader: BufferedReader, onData: (String) -> Boolean) {
        val data = StringBuilder()
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) {
                if (data.isNotEmpty()) {
                    if (!onData(data.toString())) return
                    data.clear()
                }
                continue
            }
            if (line.startsWith(":")) continue
            if (line.startsWith("data:")) {
                if (data.isNotEmpty()) data.append('\n')
                data.append(line.substring(5).trimStart())
            }
        }
        if (data.isNotEmpty()) onData(data.toString())
    }

    private fun readErrorMessage(detail: String, status: Int): String {
        val parsed =
            runCatching {
                val root = JSONObject(detail)
                root.optJSONObject("error")?.optString("message")
                    ?: root.optString("message")
            }.getOrNull()
        return parsed?.takeIf(String::isNotBlank)
            ?: "AI request failed with HTTP $status."
    }

    private fun readAiSdkStreamError(error: Any?): String =
        when (error) {
            is JSONObject ->
                error.optString("message").takeIf(String::isNotBlank)
                    ?: error.toString()
            is String -> error.takeIf(String::isNotBlank)
            else -> null
        } ?: "The provider ended the stream."

    private fun JSONObject.clearAndPut(key: String, value: Any): JSONObject {
        keys().asSequence().toList().forEach(::remove)
        return put(key, value)
    }

    private fun String.startsWithLength(length: Int): Boolean = this.length >= length

    data class StreamResult(
        val emotion: ReplyEmotion,
        val replyFormat: ReplyFormat,
    )

    enum class ReplyFormat {
        STRUCTURED,
        TEXT,
    }

    enum class StructuredTransport {
        NATIVE,
        STRICT_TOOL,
    }

    class ProviderException(message: String) : Exception(message)

    companion object {
        private const val OPENROUTER_CHAT_URL =
            "https://openrouter.ai/api/v1/chat/completions"
        private const val VERCEL_AI_SDK_LANGUAGE_MODEL_URL =
            "https://ai-gateway.vercel.sh/v4/ai/language-model"
        private const val VERCEL_GATEWAY_PROTOCOL_VERSION = "0.0.1"
        private const val VERCEL_GATEWAY_USER_AGENT = "ai-sdk/gateway/4.0.16"
        private const val DEEPSEEK_V4_FLASH = "deepseek/deepseek-v4-flash"
        private const val DEEPSEEK_V4_PRO = "deepseek/deepseek-v4-pro"
        private val REPLY_EMOTIONS =
            listOf(
                "neutral",
                "amused",
                "happy",
                "sad",
                "angry",
                "surprised",
                "affectionate",
                "annoyed",
                "curious",
            )
        private val STRUCTURED_COMPATIBILITY_PHRASES =
            listOf(
                "no object generated",
                "could not parse",
                "failed to parse",
                "invalid json",
                "invalid assistant_reply",
                "empty structured reply",
                "structured output",
            )
    }
}
