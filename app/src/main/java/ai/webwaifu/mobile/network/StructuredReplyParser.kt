package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.ReplyEmotion
import org.json.JSONObject

/**
 * Incrementally extracts only the spoken `message` string from Waifu4's structured reply schema.
 *
 * This is a small JSON string scanner, not a regex. It safely handles escaped quotes, split escape
 * sequences, and split unicode escapes without ever exposing the surrounding JSON to UI or TTS.
 */
internal class StructuredReplyParser {
    private val raw = StringBuilder()
    private var emittedMessage = ""

    fun push(delta: String): String {
        raw.append(delta)
        val next = findStringField(raw, "message") ?: return ""
        if (!next.startsWith(emittedMessage)) return ""
        val visibleDelta = next.substring(emittedMessage.length)
        emittedMessage = next
        return visibleDelta
    }

    fun finish(): StructuredReply {
        val root =
            runCatching { JSONObject(raw.toString()) }.getOrElse {
                if (emittedMessage.isNotBlank()) {
                    return StructuredReply(emittedMessage.trimEnd(), ReplyEmotion())
                }
                throw InvalidStructuredReply("Provider returned invalid structured JSON.")
            }
        val message = root.optString("message").trimEnd()
        if (message.isBlank()) {
            throw InvalidStructuredReply("Model returned an empty structured reply.")
        }
        return StructuredReply(message, parseReplyEmotion(root))
    }

    fun recoverPartial(): StructuredReply? =
        emittedMessage.trimEnd().takeIf(String::isNotBlank)?.let {
            StructuredReply(it, ReplyEmotion())
        }

    data class StructuredReply(
        val message: String,
        val emotion: ReplyEmotion,
    )

    class InvalidStructuredReply(message: String) : Exception(message)
}

internal fun parseReplyEmotion(root: JSONObject?): ReplyEmotion {
    if (root == null) return ReplyEmotion()
    val name =
        root.optString("emotion", "neutral")
            .trim()
            .lowercase()
            .takeIf(ALLOWED_REPLY_EMOTIONS::contains)
            ?: "neutral"
    return ReplyEmotion(
        name = name,
        valence = root.optDouble("valence", 0.0).toFloat().coerceIn(-1f, 1f),
        arousal = root.optDouble("arousal", 0.18).toFloat().coerceIn(0f, 1f),
        dominance = root.optDouble("dominance", 0.0).toFloat().coerceIn(-1f, 1f),
    )
}

private fun findStringField(
    source: CharSequence,
    wantedKey: String,
): String? {
    var index = 0
    while (index < source.length) {
        if (source[index] != '"') {
            index += 1
            continue
        }
        val key = decodeJsonString(source, index) ?: return null
        index = key.nextIndex
        if (!key.complete) return null
        var cursor = skipWhitespace(source, index)
        if (cursor >= source.length || source[cursor] != ':') continue
        cursor = skipWhitespace(source, cursor + 1)
        if (key.value != wantedKey || cursor >= source.length || source[cursor] != '"') continue
        return decodeJsonString(source, cursor)?.value
    }
    return null
}

private data class DecodedString(
    val value: String,
    val nextIndex: Int,
    val complete: Boolean,
)

private fun decodeJsonString(
    source: CharSequence,
    quoteIndex: Int,
): DecodedString? {
    if (quoteIndex >= source.length || source[quoteIndex] != '"') return null
    val output = StringBuilder()
    var index = quoteIndex + 1
    while (index < source.length) {
        val char = source[index]
        if (char == '"') return DecodedString(output.toString(), index + 1, true)
        if (char != '\\') {
            output.append(char)
            index += 1
            continue
        }
        if (index + 1 >= source.length) {
            return DecodedString(output.toString(), source.length, false)
        }
        when (val escape = source[index + 1]) {
            '"', '\\', '/' -> output.append(escape)
            'b' -> output.append('\b')
            'f' -> output.append('\u000C')
            'n' -> output.append('\n')
            'r' -> output.append('\r')
            't' -> output.append('\t')
            'u' -> {
                if (index + 6 > source.length) {
                    return DecodedString(output.toString(), source.length, false)
                }
                val codePoint =
                    source.subSequence(index + 2, index + 6).toString().toIntOrNull(16)
                        ?: return DecodedString(output.toString(), index + 6, false)
                output.append(codePoint.toChar())
                index += 6
                continue
            }
            else -> return DecodedString(output.toString(), index + 2, false)
        }
        index += 2
    }
    return DecodedString(output.toString(), source.length, false)
}

private fun skipWhitespace(
    source: CharSequence,
    start: Int,
): Int {
    var index = start
    while (index < source.length && source[index].isWhitespace()) index += 1
    return index
}

private val ALLOWED_REPLY_EMOTIONS =
    setOf(
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
