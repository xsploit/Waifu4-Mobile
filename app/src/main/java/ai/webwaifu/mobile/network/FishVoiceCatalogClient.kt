package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.FishVoiceScope
import ai.webwaifu.mobile.model.RemoteTtsVoice
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native Android translation of Waifu4 server/tts/voices.ts listFishVoices().
 *
 * It deliberately preserves Waifu4's scopes, page size, ordering, private-model fallback,
 * and "mine first" de-duplication while talking directly to Fish from the Android process.
 */
class FishVoiceCatalogClient {
    fun fetch(
        apiKey: String,
        scope: FishVoiceScope,
    ): List<RemoteTtsVoice> {
        require(apiKey.isNotBlank()) { "Add a Fish Audio API key before fetching voices." }
        return when (scope) {
            FishVoiceScope.MINE -> fetchMine(apiKey)
            FishVoiceScope.PUBLIC -> search(apiKey, emptyMap())
            FishVoiceScope.ALL -> {
                val publicVoices = search(apiKey, emptyMap())
                val myVoices = runCatching { fetchMine(apiKey) }.getOrDefault(emptyList())
                (myVoices + publicVoices).distinctBy(RemoteTtsVoice::id)
            }
        }
    }

    private fun fetchMine(apiKey: String): List<RemoteTtsVoice> =
        runCatching {
            search(apiKey, mapOf("self" to "true", "visibility" to "private"))
        }.getOrElse {
            search(apiKey, mapOf("self" to "true"))
        }

    private fun search(
        apiKey: String,
        extraQuery: Map<String, String>,
    ): List<RemoteTtsVoice> {
        val query =
            linkedMapOf(
                "page_number" to "1",
                "page_size" to "100",
                "sort_by" to "created_at",
            ).apply { putAll(extraQuery) }
                .entries
                .joinToString("&") { (key, value) -> "$key=$value" }
        val connection =
            (URL("$MODELS_URL?$query").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 20_000
                readTimeout = 20_000
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
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
                throw FishCatalogException("Fish voice catalog failed with HTTP $status.")
            }
            parse(JSONObject(body))
        } finally {
            connection.disconnect()
        }
    }

    internal fun parse(root: JSONObject): List<RemoteTtsVoice> {
        val items = root.optJSONArray("items") ?: JSONArray()
        return buildList {
            for (index in 0 until items.length()) {
                val voice = items.optJSONObject(index) ?: continue
                val id = voice.optString("_id").trim()
                if (id.isBlank()) continue
                add(
                    RemoteTtsVoice(
                        id = id,
                        name = voice.optString("title").trim().ifBlank { id },
                        description = voice.optString("description").trim().ifBlank { null },
                        tags = voice.optJSONArray("tags").strings(),
                        languages = voice.optJSONArray("languages").strings(),
                        source =
                            voice.optJSONObject("author")
                                ?.optString("nickname")
                                ?.trim()
                                ?.ifBlank { null },
                    ),
                )
            }
        }
    }

    private fun JSONArray?.strings(): List<String> {
        if (this == null) return emptyList()
        return buildList {
            for (index in 0 until length()) {
                optString(index).trim().takeIf(String::isNotBlank)?.let(::add)
            }
        }
    }

    class FishCatalogException(message: String) : Exception(message)

    private companion object {
        const val MODELS_URL = "https://api.fish.audio/model"
    }
}
