package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.ReplyEmotion
import org.json.JSONObject

class ReplyStreamFilter {
    private var mode = Mode.VISIBLE
    private var pendingVisible = ""
    private var metadataRaw = ""

    fun accept(chunk: String): String {
        if (chunk.isEmpty()) return ""
        if (mode == Mode.METADATA) {
            metadataRaw += chunk
            return ""
        }

        pendingVisible += chunk
        val tagIndex = pendingVisible.indexOf(OPEN_TAG)
        if (tagIndex >= 0) {
            val visible = pendingVisible.substring(0, tagIndex)
            metadataRaw += pendingVisible.substring(tagIndex)
            pendingVisible = ""
            mode = Mode.METADATA
            return visible
        }

        val heldBack = heldBackLength(pendingVisible)
        val emitLength = pendingVisible.length - heldBack
        val visible = pendingVisible.substring(0, emitLength)
        pendingVisible = pendingVisible.substring(emitLength)
        return visible
    }

    fun finish(): FilteredReply {
        val tail = if (mode == Mode.VISIBLE) pendingVisible else ""
        pendingVisible = ""
        val rawMetadata = extractMetadataJson(metadataRaw)
        return FilteredReply(tail, parseEmotion(rawMetadata))
    }

    private fun heldBackLength(pending: String): Int {
        val maximum = minOf(pending.length, OPEN_TAG.length - 1)
        for (length in maximum downTo 1) {
            if (OPEN_TAG.startsWith(pending.takeLast(length))) return length
        }
        return 0
    }

    private fun extractMetadataJson(raw: String): String {
        val start = raw.indexOf(OPEN_TAG)
        if (start < 0) return ""
        val contentStart = start + OPEN_TAG.length
        val close = raw.indexOf(CLOSE_TAG, contentStart)
        return if (close < 0) {
            raw.substring(contentStart).trim()
        } else {
            raw.substring(contentStart, close).trim()
        }
    }

    private fun parseEmotion(value: String): ReplyEmotion {
        if (value.isBlank()) return ReplyEmotion()
        return runCatching {
            val json = JSONObject(value)
            val name =
                json.optString("emotion", "neutral")
                    .trim()
                    .lowercase()
                    .takeIf(ALLOWED_EMOTIONS::contains)
                    ?: "neutral"
            ReplyEmotion(
                name = name,
                valence = json.optDouble("valence", 0.0).toFloat().coerceIn(-1f, 1f),
                arousal = json.optDouble("arousal", 0.18).toFloat().coerceIn(0f, 1f),
                dominance = json.optDouble("dominance", 0.0).toFloat().coerceIn(-1f, 1f),
            )
        }.getOrDefault(ReplyEmotion())
    }

    data class FilteredReply(
        val visibleTail: String,
        val emotion: ReplyEmotion,
    )

    private enum class Mode {
        VISIBLE,
        METADATA,
    }

    companion object {
        private const val OPEN_TAG = "<yw-meta>"
        private const val CLOSE_TAG = "</yw-meta>"
        private val ALLOWED_EMOTIONS =
            setOf(
                "neutral",
                "amused",
                "happy",
                "excited",
                "curious",
                "confused",
                "thinking",
                "surprised",
                "angry",
                "annoyed",
                "embarrassed",
                "grateful",
                "optimistic",
                "proud",
                "nervous",
                "sad",
                "caring",
            )
    }
}
