package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.ProviderEndpoint
import ai.webwaifu.mobile.model.ProviderModel
import ai.webwaifu.mobile.model.ProviderReasoningInfo
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONArray
import org.json.JSONObject

class ModelCatalogClient {
    fun fetch(
        provider: AiProvider,
        apiKey: String?,
    ): List<ProviderModel> {
        val endpoint =
            when (provider) {
                AiProvider.OPENROUTER -> OPENROUTER_MODELS_URL
                AiProvider.VERCEL -> VERCEL_MODELS_URL
            }
        val connection =
            (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 20_000
                readTimeout = 30_000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "WebWaifu-Mobile/0.1")
                if (!apiKey.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
                }
            }
        return try {
            val status = connection.responseCode
            val body =
                (if (status in 200..299) connection.inputStream else connection.errorStream)
                    ?.bufferedReader()
                    ?.use { it.readText() }
                    .orEmpty()
            if (status !in 200..299) {
                throw CatalogException("Model catalog failed with HTTP $status.")
            }
            parse(provider, JSONObject(body))
        } finally {
            connection.disconnect()
        }
    }

    fun fetchVercelEndpoints(model: String): List<ProviderEndpoint> {
        val segments = model.trim().split('/').filter(String::isNotBlank)
        require(segments.size >= 2) { "Vercel model ID must include creator and model." }
        val encoded = segments.joinToString("/") {
            URLEncoder.encode(it, Charsets.UTF_8.name()).replace("+", "%20")
        }
        val connection =
            (URL("$VERCEL_MODELS_URL/$encoded/endpoints").openConnection() as HttpURLConnection)
                .apply {
                    requestMethod = "GET"
                    connectTimeout = 20_000
                    readTimeout = 30_000
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("User-Agent", "WebWaifu-Mobile/0.1")
                }
        return try {
            val status = connection.responseCode
            val body =
                (if (status in 200..299) connection.inputStream else connection.errorStream)
                    ?.bufferedReader()
                    ?.use { it.readText() }
                    .orEmpty()
            if (status !in 200..299) {
                throw CatalogException("Vercel provider endpoints failed with HTTP $status.")
            }
            parseVercelEndpoints(JSONObject(body))
        } finally {
            connection.disconnect()
        }
    }

    internal fun parse(
        provider: AiProvider,
        root: JSONObject,
    ): List<ProviderModel> {
        val data = root.optJSONArray("data") ?: JSONArray()
        return buildList {
            for (index in 0 until data.length()) {
                val entry = data.optJSONObject(index) ?: continue
                val id = entry.optString("id").trim()
                if (id.isEmpty()) continue
                val type =
                    sequenceOf("type", "modelType", "model_type")
                        .map(entry::optString)
                        .firstOrNull(String::isNotBlank)
                        ?.lowercase()
                val architecture = entry.optJSONObject("architecture")
                val inputModalities = architecture.stringSet("input_modalities")
                val outputModalities = architecture.stringSet("output_modalities")
                val tags = entry.stringSet("tags") + inputModalities
                if (!isChatModel(id, type, tags)) continue

                val parameters =
                    entry.stringSet("supported_parameters") +
                        entry.optJSONObject("top_provider").stringSet("supported_parameters") +
                        endpointParameters(entry.optJSONArray("endpoints"))
                val capabilities =
                    buildSet {
                        if (
                            parameters.any {
                                it == "structured_outputs" ||
                                    it == "json_schema" ||
                                    it == "response_format"
                            }
                        ) {
                            add("json")
                        }
                        if (inputModalities.any { it == "image" || it == "image-input" || it == "vision" }) {
                            add("vision")
                        }
                        if (parameters.any { it == "tools" || it == "tool_choice" }) add("tools")
                        if (
                            parameters.any { it == "reasoning" || it == "include_reasoning" } ||
                            tags.contains("reasoning")
                        ) {
                            add("reasoning")
                        }
                        if (outputModalities.contains("audio")) add("audio")
                        if (provider == AiProvider.VERCEL && tags.contains("implicit-caching")) {
                            add("cache")
                        }
                    }
                val contextWindow =
                    entry.optPositiveInt("context_length")
                        ?: entry.optPositiveInt("context_window")
                val maxTokens =
                    entry.optPositiveInt("max_tokens")
                        ?: entry.optJSONObject("top_provider")?.optPositiveInt("max_completion_tokens")
                val reasoning = parseReasoning(entry.optJSONObject("reasoning"))
                val supportsStructuredOutputs =
                    parameters.any {
                        it == "structured_outputs" ||
                            it == "json_schema" ||
                            it == "response_format"
                    } && (provider != AiProvider.VERCEL || type == null || type == "language")
                val supportsImplicitCaching =
                    tags.any {
                        it == "cache" ||
                            it == "caching" ||
                            it == "implicit-caching" ||
                            it == "prompt-caching"
                    } || endpointImplicitCaching(entry.optJSONArray("endpoints"))
                val name = entry.optString("name").trim()
                val label =
                    buildString {
                        append(if (name.isBlank() || name == id) id else "$name · $id")
                        if (capabilities.isNotEmpty()) {
                            append(" [")
                            append(capabilities.joinToString())
                            append(']')
                        }
                        if (contextWindow != null) {
                            append(" · ")
                            append(formatCount(contextWindow))
                            append(" ctx")
                        }
                    }
                add(
                    ProviderModel(
                        id = id,
                        label = label,
                        contextWindow = contextWindow,
                        maxTokens = maxTokens,
                        supportedParameters = parameters,
                        inputModalities = inputModalities,
                        outputModalities = outputModalities,
                        tags = tags,
                        type = type,
                        supportsStructuredOutputs = supportsStructuredOutputs,
                        supportsImplicitCaching = supportsImplicitCaching,
                        reasoning = reasoning,
                        capabilities = capabilities,
                    ),
                )
            }
        }.distinctBy(ProviderModel::id).sortedBy { it.id.lowercase() }
    }

    internal fun parseVercelEndpoints(root: JSONObject): List<ProviderEndpoint> {
        val data = root.optJSONObject("data")
        val entries = data?.optJSONArray("endpoints") ?: root.optJSONArray("endpoints") ?: JSONArray()
        val byProvider = linkedMapOf<String, ProviderEndpoint>()
        for (index in 0 until entries.length()) {
            val entry = entries.optJSONObject(index) ?: continue
            val providerName =
                entry.optString("provider_name").trim()
                    .ifBlank { entry.optString("provider").trim() }
            if (providerName.isBlank()) continue
            val latency = entry.optJSONObject("latency_last_1h")
            val throughput = entry.optJSONObject("throughput_last_1h")
            val endpoint =
                ProviderEndpoint(
                    providerName = providerName,
                    status = entry.optFiniteInt("status"),
                    supportedParameters = entry.stringSet("supported_parameters"),
                    supportsImplicitCaching =
                        entry.optBoolean("supports_implicit_caching", false),
                    contextLength = entry.optPositiveInt("context_length"),
                    maxCompletionTokens = entry.optPositiveInt("max_completion_tokens"),
                    latencyP50Ms = latency.optFiniteDouble("p50"),
                    latencyP95Ms = latency.optFiniteDouble("p95"),
                    throughputP50 = throughput.optFiniteDouble("p50"),
                    uptimeLastHour = entry.optFiniteDouble("uptime_last_1h"),
                    uptimeLastDay = entry.optFiniteDouble("uptime_last_1d"),
                    tags = entry.stringSet("tags"),
                )
            val current = byProvider[providerName]
            if (current == null || (current.status != 0 && endpoint.status == 0)) {
                byProvider[providerName] = endpoint
            }
        }
        return byProvider.values.sortedWith(
            compareBy<ProviderEndpoint> { it.status != null && it.status != 0 }
                .thenBy { it.providerName.lowercase() },
        )
    }

    private fun parseReasoning(value: JSONObject?): ProviderReasoningInfo? {
        if (value == null) return null
        val result =
            ProviderReasoningInfo(
                defaultEffort = value.optString("default_effort").trim().ifBlank { null },
                defaultEnabled =
                    value.opt("default_enabled").takeIf { it is Boolean } as? Boolean,
                mandatory = value.opt("mandatory").takeIf { it is Boolean } as? Boolean,
                supportedEfforts = value.stringSet("supported_efforts"),
            )
        return result.takeIf {
            it.defaultEffort != null ||
                it.defaultEnabled != null ||
                it.mandatory != null ||
                it.supportedEfforts.isNotEmpty()
        }
    }

    private fun isChatModel(
        id: String,
        type: String?,
        tags: Set<String>,
    ): Boolean {
        if (type == "embedding" || type == "embeddings") return false
        if (type != null && type != "language") return false
        if (tags.any { it == "embed" || it == "embedding" || it == "embeddings" }) return false
        val normalized = id.lowercase()
        if (normalized.contains("embedding")) return false

        val parts = normalized.split('/')
        val vendor = parts.firstOrNull().orEmpty()
        val leaf = parts.lastOrNull().orEmpty().replace('_', '.')
        val openAi = parts.size == 1 || vendor == "openai"
        val premiumO1 =
            leaf == "o1" ||
                leaf.startsWith("o1-") ||
                leaf.startsWith("o1.") ||
                leaf.startsWith("o1pro")
        val premiumPro =
            leaf.split('.', '-').any { it == "pro" }
        return !(openAi && (premiumO1 || premiumPro))
    }

    private fun endpointParameters(endpoints: JSONArray?): Set<String> =
        buildSet {
            if (endpoints == null) return@buildSet
            for (index in 0 until endpoints.length()) {
                addAll(endpoints.optJSONObject(index).stringSet("supported_parameters"))
            }
        }

    private fun endpointImplicitCaching(endpoints: JSONArray?): Boolean {
        if (endpoints == null) return false
        for (index in 0 until endpoints.length()) {
            if (endpoints.optJSONObject(index)?.optBoolean("supports_implicit_caching") == true) {
                return true
            }
        }
        return false
    }

    private fun JSONObject?.stringSet(key: String): Set<String> {
        val values = this?.optJSONArray(key) ?: return emptySet()
        return buildSet {
            for (index in 0 until values.length()) {
                values.optString(index).trim().lowercase().takeIf(String::isNotEmpty)?.let(::add)
            }
        }
    }

    private fun JSONObject.optPositiveInt(key: String): Int? =
        optLong(key, -1L)
            .takeIf { it > 0 }
            ?.coerceAtMost(Int.MAX_VALUE.toLong())
            ?.toInt()

    private fun JSONObject.optFiniteInt(key: String): Int? =
        opt(key).let { value ->
            (value as? Number)?.toInt()
        }

    private fun JSONObject?.optFiniteDouble(key: String): Double? =
        (this?.opt(key) as? Number)?.toDouble()?.takeIf(Double::isFinite)

    private fun formatCount(value: Int): String =
        when {
            value >= 1_000_000 -> "${value / 1_000_000.0}".trimEnd('0').trimEnd('.') + "M"
            value >= 1_000 -> "${value / 1_000}K"
            else -> value.toString()
        }

    class CatalogException(message: String) : Exception(message)

    companion object {
        private const val OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
        private const val VERCEL_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models"
    }
}
